"""The viewer's own YouTube library, kept locally: followed channels and their feed,
watch history with resume positions, and "watch later"."""

import asyncio
import logging
from collections.abc import Sequence
from datetime import timedelta

from sqlalchemy import func
from sqlmodel import Session, col, delete, select

from app.tube.models import FeedVideo, FollowedChannel, LaterVideo, WatchedVideo, utcnow
from app.tube.ports import TubeUnavailableError, VideoCard
from app.tube.service import TubeService

log = logging.getLogger(__name__)

FEED_PER_CHANNEL = 15
# YouTube's channel RSS feeds fail now and then for a few minutes: try a few times.
RSS_RETRY_DELAYS_S = (0, 2, 6)
FEED_MAX_AGE = timedelta(days=60)
# Under this many seconds left, a video counts as watched (credits, end screens).
FINISHED_TAIL_S = 30
HISTORY_LIMIT = 200


class NotFollowingError(Exception):
    pass


class TubeLibrary:
    def __init__(self, tube: TubeService) -> None:
        self._tube = tube

    # --- following ----------------------------------------------------------------------

    def followed(self, session: Session) -> Sequence[FollowedChannel]:
        return session.exec(select(FollowedChannel).order_by(col(FollowedChannel.name))).all()

    def is_following(self, session: Session, channel_id: str) -> bool:
        return session.get(FollowedChannel, channel_id) is not None

    async def follow(self, session: Session, channel_id: str) -> FollowedChannel:
        page = await self._tube.channel(channel_id)  # validates the id, gives the real UC id and name
        existing = session.get(FollowedChannel, page.channel.id)
        if existing:
            return existing
        row = FollowedChannel(channel_id=page.channel.id, name=page.channel.name, avatar_url=page.channel.avatar_url)
        session.add(row)
        session.commit()
        session.refresh(row)
        await self.refresh_channel(session, row)
        return row

    def unfollow(self, session: Session, channel_id: str) -> None:
        row = session.get(FollowedChannel, channel_id)
        if row is None:
            raise NotFollowingError(channel_id)
        session.delete(row)
        session.exec(delete(FeedVideo).where(col(FeedVideo.channel_id) == channel_id))
        session.commit()

    async def refresh_channel(self, session: Session, channel: FollowedChannel) -> None:
        """Re-read a followed channel's newest uploads into the feed. The RSS feed has
        publish dates but no durations and fails now and then (404/500 for minutes); the
        channel's video list has durations but no dates. Both are used; with only the
        list, new videos get in anyway and their dates follow on a later refresh."""
        feed: list[VideoCard] | None = None
        feed_error: TubeUnavailableError | None = None
        for delay in RSS_RETRY_DELAYS_S:
            await asyncio.sleep(delay)
            try:
                feed = await self._tube.channel_feed(channel.channel_id)
                break
            except TubeUnavailableError as e:
                feed_error = e
        listing: list[VideoCard] | None = None
        try:
            listing = (await self._tube.channel(channel.channel_id)).videos
        except TubeUnavailableError as e:
            if feed is None:
                channel.last_error = f"{feed_error}; {e}"[:500]
                channel.last_checked_at = utcnow()
                session.add(channel)
                session.commit()
                return
        durations = {v.id: v.duration_seconds for v in listing or []}
        for card in (feed if feed is not None else listing or [])[:FEED_PER_CHANNEL]:
            row = session.get(FeedVideo, card.id) or FeedVideo(video_id=card.id, channel_id=channel.channel_id, title=card.title)
            row.title = card.title
            row.channel_name = card.channel_name or channel.name
            row.published_at = card.published_at or row.published_at
            row.view_count = card.view_count if card.view_count is not None else row.view_count
            row.duration_seconds = durations.get(card.id) or card.duration_seconds or row.duration_seconds
            session.add(row)
        channel.last_error = None if feed is not None else f"no publish dates yet: {feed_error}"[:500]
        channel.last_checked_at = utcnow()
        session.add(channel)
        session.commit()

    async def refresh_all(self, session: Session) -> None:
        for channel in self.followed(session):
            await self.refresh_channel(session, channel)
            await asyncio.sleep(1)  # be gentle with YouTube

        cutoff = utcnow() - FEED_MAX_AGE
        session.exec(delete(FeedVideo).where(func.coalesce(FeedVideo.published_at, FeedVideo.seen_at) < cutoff))
        session.commit()

    def feed(self, session: Session, limit: int) -> Sequence[FeedVideo]:
        return session.exec(
            select(FeedVideo).order_by(func.coalesce(FeedVideo.published_at, FeedVideo.seen_at).desc()).limit(limit)
        ).all()

    # --- watching -----------------------------------------------------------------------

    def record_progress(self, session: Session, card: VideoCard, position: float, duration: float | None) -> WatchedVideo:
        row = session.get(WatchedVideo, card.id) or WatchedVideo(video_id=card.id, title=card.title)
        row.title = card.title
        row.channel_id = card.channel_id
        row.channel_name = card.channel_name
        row.duration_seconds = card.duration_seconds or (int(duration) if duration else None)
        row.position_seconds = max(0.0, position)
        total = row.duration_seconds
        row.finished = bool(total) and position >= total - FINISHED_TAIL_S
        row.watched_at = utcnow()
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    def watched(self, session: Session, video_id: str) -> WatchedVideo | None:
        return session.get(WatchedVideo, video_id)

    def resume_position(self, session: Session, video_id: str) -> float | None:
        """Where to pick a video up again: None if never played or played to the end."""
        w = session.get(WatchedVideo, video_id)
        return None if w is None or w.finished else w.position_seconds

    def continue_watching(self, session: Session, limit: int) -> Sequence[WatchedVideo]:
        return session.exec(
            select(WatchedVideo).where(col(WatchedVideo.finished).is_(False)).where(col(WatchedVideo.position_seconds) > 10)
            .order_by(col(WatchedVideo.watched_at).desc()).limit(limit)
        ).all()

    def history(self, session: Session, limit: int = HISTORY_LIMIT) -> Sequence[WatchedVideo]:
        return session.exec(select(WatchedVideo).order_by(col(WatchedVideo.watched_at).desc()).limit(limit)).all()

    def forget(self, session: Session, video_id: str) -> None:
        if row := session.get(WatchedVideo, video_id):
            session.delete(row)
            session.commit()

    # --- watch later --------------------------------------------------------------------

    def is_later(self, session: Session, video_id: str) -> bool:
        return session.get(LaterVideo, video_id) is not None

    def later(self, session: Session) -> Sequence[LaterVideo]:
        return session.exec(select(LaterVideo).order_by(col(LaterVideo.added_at).desc())).all()

    def add_later(self, session: Session, card: VideoCard) -> LaterVideo:
        row = session.get(LaterVideo, card.id) or LaterVideo(
            video_id=card.id, title=card.title, channel_id=card.channel_id, channel_name=card.channel_name,
            duration_seconds=card.duration_seconds,
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    def remove_later(self, session: Session, video_id: str) -> None:
        if row := session.get(LaterVideo, video_id):
            session.delete(row)
            session.commit()

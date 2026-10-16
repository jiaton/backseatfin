"""Followed YouTube playlists: add a video to one on the phone and it's on the car's
home screen (YouTube's own playlists are the way in, without signing in to YouTube)."""

from collections.abc import Sequence
from datetime import timedelta

from sqlmodel import Session, col, delete, select

from app.tube.library import NotFollowingError
from app.tube.models import FollowedPlaylist, PlaylistItem, utcnow
from app.tube.ports import TubeUnavailableError
from app.tube.service import TubeService

# A followed playlist is re-read when the home screen opens and it's older than this:
# a video added on the phone a minute ago is in the car now.
PLAYLIST_FRESH_S = 60


class PlaylistLibrary:
    def __init__(self, tube: TubeService) -> None:
        self._tube = tube

    def followed(self, session: Session) -> Sequence[FollowedPlaylist]:
        return session.exec(select(FollowedPlaylist).order_by(col(FollowedPlaylist.followed_at))).all()

    def is_following(self, session: Session, playlist_id: str) -> bool:
        return session.get(FollowedPlaylist, playlist_id) is not None

    async def follow(self, session: Session, playlist_id: str) -> FollowedPlaylist:
        existing = session.get(FollowedPlaylist, playlist_id)
        if existing:
            return existing
        page = await self._tube.playlist(playlist_id, fresh=True)  # validates it's readable
        row = FollowedPlaylist(playlist_id=playlist_id, title=page.playlist.title, channel_name=page.playlist.channel_name)
        session.add(row)
        session.commit()
        session.refresh(row)
        await self.refresh_playlist(session, row)
        return row

    def unfollow(self, session: Session, playlist_id: str) -> None:
        row = session.get(FollowedPlaylist, playlist_id)
        if row is None:
            raise NotFollowingError(playlist_id)
        session.delete(row)
        session.exec(delete(PlaylistItem).where(col(PlaylistItem.playlist_id) == playlist_id))
        session.commit()

    async def refresh_playlist(self, session: Session, playlist: FollowedPlaylist) -> None:
        """Re-read the playlist. Videos new since last time get "now" as when they were
        seen, so they lead the home row; videos taken out of the playlist go."""
        try:
            page = await self._tube.playlist(playlist.playlist_id, fresh=True)
        except TubeUnavailableError as e:
            playlist.last_error = str(e)[:500]
            playlist.last_checked_at = utcnow()
            session.add(playlist)
            session.commit()
            return
        now = utcnow()
        first_read = playlist.last_checked_at is None
        known = {i.video_id: i for i in session.exec(select(PlaylistItem).where(col(PlaylistItem.playlist_id) == playlist.playlist_id))}
        ids = [v.id for v in page.videos]
        for index, video in enumerate(page.videos):
            item = known.get(video.id)
            if item is None:
                # First read: YouTube lists a playlist oldest-added first, so later = newer.
                seen = now - timedelta(seconds=len(ids) - index) if first_read else now
                item = PlaylistItem(playlist_id=playlist.playlist_id, video_id=video.id, title=video.title, seen_at=seen)
            item.title = video.title
            item.channel_id = video.channel_id
            item.channel_name = video.channel_name
            item.duration_seconds = video.duration_seconds
            session.add(item)
        for gone in set(known) - set(ids):
            session.delete(known[gone])
        playlist.title = page.playlist.title
        playlist.last_error = None
        playlist.last_checked_at = now
        session.add(playlist)
        session.commit()

    async def refresh_stale_playlists(self, session: Session) -> None:
        cutoff = utcnow() - timedelta(seconds=PLAYLIST_FRESH_S)
        for playlist in self.followed(session):
            checked = playlist.last_checked_at
            if checked is None or checked.replace(tzinfo=cutoff.tzinfo) < cutoff:
                await self.refresh_playlist(session, playlist)

    def items(self, session: Session, playlist_id: str, limit: int) -> Sequence[PlaylistItem]:
        return session.exec(
            select(PlaylistItem).where(col(PlaylistItem.playlist_id) == playlist_id)
            .order_by(col(PlaylistItem.seen_at).desc()).limit(limit)
        ).all()


    async def refresh_all(self, session: Session) -> None:
        for playlist in self.followed(session):
            await self.refresh_playlist(session, playlist)

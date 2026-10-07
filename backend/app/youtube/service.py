import asyncio
import logging
from collections.abc import Sequence
from typing import Protocol

from sqlmodel import Session, col, select

from app.youtube.models import PlaylistSource, Video, VideoStatus, utcnow
from app.youtube.ports import PlaylistInfo, VideoSourcePort

log = logging.getLogger(__name__)

# A FAILED video is requeued by each playlist sync (the sync interval doubles as retry
# backoff) until it has been attempted this many times; after that only a manual retry.
MAX_ATTEMPTS = 3


class NotFoundError(Exception):
    pass


class ConflictError(Exception):
    pass


class DownloadQueue(Protocol):
    """What the services need from the download worker (implemented in worker.py)."""

    def wake(self) -> None: ...

    def request_cancel(self, video_id: int) -> bool:
        """True if that video was the one downloading and has been asked to stop."""
        ...


class PlaylistService:
    def __init__(self, source: VideoSourcePort, queue: DownloadQueue) -> None:
        self._source = source
        self._queue = queue

    def list_sources(self, session: Session) -> Sequence[PlaylistSource]:
        return session.exec(select(PlaylistSource).order_by(col(PlaylistSource.created_at))).all()

    async def add_source(self, session: Session, url: str) -> PlaylistSource:
        if session.exec(select(PlaylistSource).where(PlaylistSource.url == url)).first():
            raise ConflictError("this playlist is already a source")
        # Fetch before inserting: an unreadable URL (private playlist, typo) is rejected
        # up front instead of becoming a source row that only ever errors.
        info = await asyncio.to_thread(self._source.fetch_playlist, url)
        src = PlaylistSource(url=url, title=info.title)
        session.add(src)
        session.commit()
        session.refresh(src)
        self._ingest(session, src, info)
        session.refresh(src)  # _ingest committed, which expired it
        return src

    def set_enabled(self, session: Session, source_id: int, enabled: bool) -> PlaylistSource:
        src = self._get_source(session, source_id)
        src.enabled = enabled
        session.add(src)
        session.commit()
        session.refresh(src)
        return src

    def delete_source(self, session: Session, source_id: int) -> None:
        src = self._get_source(session, source_id)
        for video in session.exec(select(Video).where(Video.source_id == source_id)):
            video.source_id = None
            session.add(video)
        session.delete(src)
        session.commit()

    async def sync_source(self, session: Session, source_id: int) -> tuple[int, str | None]:
        src = self._get_source(session, source_id)
        try:
            info = await asyncio.to_thread(self._source.fetch_playlist, src.url)
        except Exception as e:
            log.warning("playlist sync failed for source %s: %s", src.id, e)
            src.last_error = str(e)[:500]
            src.last_synced_at = utcnow()
            session.add(src)
            session.commit()
            return 0, src.last_error
        return self._ingest(session, src, info), None

    async def sync_all(self, session: Session) -> list[tuple[int, int, str | None]]:
        results = []
        enabled = session.exec(select(PlaylistSource).where(PlaylistSource.enabled == True)).all()  # noqa: E712
        for src in enabled:
            assert src.id is not None
            new, err = await self.sync_source(session, src.id)
            results.append((src.id, new, err))
        return results

    def _ingest(self, session: Session, src: PlaylistSource, info: PlaylistInfo) -> int:
        ids = [e.video_id for e in info.entries]
        known = {v.youtube_id: v for v in session.exec(select(Video).where(col(Video.youtube_id).in_(ids)))}
        new = 0
        for entry in info.entries:
            existing = known.get(entry.video_id)
            if existing is None:
                session.add(
                    Video(
                        source_id=src.id,
                        youtube_id=entry.video_id,
                        title=entry.title,
                        channel=entry.channel,
                        duration_seconds=entry.duration_seconds,
                    )
                )
                new += 1
            elif existing.status == VideoStatus.FAILED and existing.attempts < MAX_ATTEMPTS:
                existing.status = VideoStatus.QUEUED
                existing.updated_at = utcnow()
                session.add(existing)
                new += 1
        src.last_synced_at = utcnow()
        src.last_error = None
        session.add(src)
        session.commit()
        if new:
            self._queue.wake()
        return new

    def _get_source(self, session: Session, source_id: int) -> PlaylistSource:
        src = session.get(PlaylistSource, source_id)
        if src is None:
            raise NotFoundError(f"source {source_id} not found")
        return src


class VideoService:
    def __init__(self, queue: DownloadQueue) -> None:
        self._queue = queue

    def list_videos(self, session: Session, status: VideoStatus | None, limit: int) -> Sequence[Video]:
        query = select(Video).order_by(col(Video.created_at).desc()).limit(limit)
        if status is not None:
            query = query.where(Video.status == status)
        return session.exec(query).all()

    def retry(self, session: Session, video_id: int) -> Video:
        video = self._get(session, video_id)
        if video.status not in {VideoStatus.FAILED, VideoStatus.CANCELLED, VideoStatus.INTERRUPTED}:
            raise ConflictError(f"cannot retry a video that is {video.status.value}")
        video.status = VideoStatus.QUEUED
        video.error = None
        video.updated_at = utcnow()
        session.add(video)
        session.commit()
        session.refresh(video)
        self._queue.wake()
        return video

    def cancel(self, session: Session, video_id: int) -> Video:
        video = self._get(session, video_id)
        if video.status == VideoStatus.QUEUED:
            video.status = VideoStatus.CANCELLED
            video.updated_at = utcnow()
            session.add(video)
            session.commit()
            session.refresh(video)
        elif video.status == VideoStatus.DOWNLOADING:
            # The worker flips the row to CANCELLED once yt-dlp actually stops.
            self._queue.request_cancel(video_id)
        else:
            raise ConflictError(f"cannot cancel a video that is {video.status.value}")
        return video

    def _get(self, session: Session, video_id: int) -> Video:
        video = session.get(Video, video_id)
        if video is None:
            raise NotFoundError(f"video {video_id} not found")
        return video

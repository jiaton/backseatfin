"""Background loops: one download worker (one video at a time) and one playlist poller."""

import asyncio
import contextlib
import logging
import shutil
from collections.abc import Callable
from pathlib import Path

from sqlmodel import Session, col, select

from app.youtube.layout import EpisodePlan, episode_nfo, plan_episode, season_dir_for, tvshow_nfo
from app.youtube.models import Video, VideoStatus, utcnow
from app.youtube.ports import DownloadCancelledError, DownloadedVideo, MediaLibraryPort, VideoSourcePort
from app.youtube.service import PlaylistService

log = logging.getLogger(__name__)

SessionFactory = Callable[[], Session]


class DownloadWorker:
    def __init__(
        self,
        source: VideoSourcePort,
        library: MediaLibraryPort,
        session_factory: SessionFactory,
        library_root: Path,
        tmp_root: Path,
    ) -> None:
        self._source = source
        self._library = library
        self._session_factory = session_factory
        self._library_root = library_root
        self._tmp_root = tmp_root
        self._wake_event = asyncio.Event()
        self._cancel_ids: set[int] = set()
        self._current_id: int | None = None
        self._shutting_down = False
        self._task: asyncio.Task | None = None

    # --- DownloadQueue protocol -------------------------------------------------------

    def wake(self) -> None:
        self._wake_event.set()

    def request_cancel(self, video_id: int) -> bool:
        if self._current_id != video_id:
            return False
        self._cancel_ids.add(video_id)
        return True

    # --- lifecycle --------------------------------------------------------------------

    def start(self) -> None:
        self._recover()
        self._task = asyncio.create_task(self._run(), name="download-worker")

    async def stop(self) -> None:
        self._shutting_down = True
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    def _recover(self) -> None:
        """Anything left DOWNLOADING died with the previous process; INTERRUPTED rows were
        stopped by a clean shutdown. Both go back in the queue."""
        with self._session_factory() as session:
            stale = session.exec(
                select(Video).where(col(Video.status).in_([VideoStatus.DOWNLOADING, VideoStatus.INTERRUPTED]))
            ).all()
            for video in stale:
                log.info("requeueing %s (%s) left %s by previous run", video.id, video.youtube_id, video.status.value)
                video.status = VideoStatus.QUEUED
                session.add(video)
            session.commit()

    # --- loop -------------------------------------------------------------------------

    async def _run(self) -> None:
        while True:
            claimed = self._claim_next()
            if claimed is None:
                await self._wake_event.wait()
                self._wake_event.clear()
                continue
            await self._process(*claimed)

    def _claim_next(self) -> tuple[int, str] | None:
        with self._session_factory() as session:
            video = session.exec(
                select(Video).where(Video.status == VideoStatus.QUEUED).order_by(col(Video.created_at)).limit(1)
            ).first()
            if video is None or video.id is None:
                return None
            video.status = VideoStatus.DOWNLOADING
            video.attempts += 1
            video.error = None
            video.updated_at = utcnow()
            session.add(video)
            session.commit()
            return video.id, video.youtube_id

    async def _process(self, video_id: int, youtube_id: str) -> None:
        self._current_id = video_id
        workdir = self._tmp_root / youtube_id
        shutil.rmtree(workdir, ignore_errors=True)
        workdir.mkdir(parents=True)

        def should_cancel() -> bool:
            return self._shutting_down or video_id in self._cancel_ids

        try:
            downloaded = await asyncio.to_thread(self._source.download, youtube_id, workdir, should_cancel)
            plan = await asyncio.to_thread(self._place, downloaded)
        except asyncio.CancelledError:
            # Task cancelled at shutdown; the thread sees should_cancel() on its next
            # progress tick. Workdir is left for the next run's rmtree.
            self._finish(video_id, VideoStatus.INTERRUPTED)
            raise
        except DownloadCancelledError:
            status = VideoStatus.INTERRUPTED if self._shutting_down else VideoStatus.CANCELLED
            self._finish(video_id, status)
            shutil.rmtree(workdir, ignore_errors=True)
        except Exception as e:
            log.exception("download failed for %s", youtube_id)
            self._finish(video_id, VideoStatus.FAILED, error=str(e)[:1000])
            shutil.rmtree(workdir, ignore_errors=True)
        else:
            self._finish(video_id, VideoStatus.DONE, file_path=str(plan.media_path), title=downloaded.title,
                         channel=downloaded.channel)
            shutil.rmtree(workdir, ignore_errors=True)
            await self._library.notify_new_files([plan.media_path])
        finally:
            self._cancel_ids.discard(video_id)
            self._current_id = None

    def _place(self, downloaded: DownloadedVideo) -> EpisodePlan:
        season_dir = season_dir_for(downloaded, self._library_root)
        existing = [p.name for p in season_dir.iterdir()] if season_dir.exists() else []
        plan = plan_episode(downloaded, self._library_root, existing)

        plan.season_dir.mkdir(parents=True, exist_ok=True)
        show_nfo = plan.show_dir / "tvshow.nfo"
        if not show_nfo.exists():
            show_nfo.write_text(tvshow_nfo(downloaded.channel), encoding="utf-8")
        shutil.move(downloaded.media_path, plan.media_path)
        if downloaded.thumbnail_path:
            shutil.move(downloaded.thumbnail_path, plan.thumb_path)
        # NFO last: its presence is what marks the episode as complete (and what the
        # same-day episode numbering counts).
        plan.nfo_path.write_text(episode_nfo(downloaded, plan), encoding="utf-8")
        return plan

    def _finish(self, video_id: int, status: VideoStatus, error: str | None = None, file_path: str | None = None,
                title: str | None = None, channel: str | None = None) -> None:
        with self._session_factory() as session:
            video = session.get(Video, video_id)
            if video is None:
                return
            video.status = status
            video.error = error
            if file_path:
                video.file_path = file_path
            if title:
                video.title = title
            if channel:
                video.channel = channel
            video.updated_at = utcnow()
            session.add(video)
            session.commit()


class PlaylistSyncLoop:
    def __init__(self, service: PlaylistService, session_factory: SessionFactory, interval_seconds: int) -> None:
        self._service = service
        self._session_factory = session_factory
        self._interval = interval_seconds
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._run(), name="playlist-sync")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    async def _run(self) -> None:
        while True:
            try:
                with self._session_factory() as session:
                    await self._service.sync_all(session)
            except Exception:
                log.exception("playlist sync loop iteration failed")
            await asyncio.sleep(self._interval)

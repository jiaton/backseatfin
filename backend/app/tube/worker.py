"""Background loop: re-read followed channels and playlists, prune the image cache."""

import asyncio
import contextlib
import logging
from collections.abc import Callable

from sqlmodel import Session

from app.tube.library import TubeLibrary
from app.tube.playlists import PlaylistLibrary
from app.tube.service import TubeService

log = logging.getLogger(__name__)


class FeedRefreshLoop:
    def __init__(
        self, library: TubeLibrary, playlists: PlaylistLibrary, tube: TubeService,
        session_factory: Callable[[], Session], interval_seconds: int,
    ) -> None:
        self._library = library
        self._playlists = playlists
        self._tube = tube
        self._session_factory = session_factory
        self._interval = interval_seconds
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._run(), name="tube-feed-refresh")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    async def _run(self) -> None:
        while True:
            try:
                with self._session_factory() as session:
                    await self._library.refresh_all(session)
                    await self._playlists.refresh_all(session)
                self._tube.prune_images()
            except Exception:
                log.exception("feed refresh iteration failed")
            await asyncio.sleep(self._interval)

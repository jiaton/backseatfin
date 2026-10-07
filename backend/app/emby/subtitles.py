"""Text subtitles extracted by Emby, cached on disk, never blocking playback.

Emby extracts an embedded subtitle by reading through the media file, which for a
multi-GB mkv takes longer than anyone will wait at "play". So extraction runs in the
background with a generous timeout; a stream start waits only briefly for it and
otherwise plays without subtitles, and the player polls `status` and reconnects once
the file is ready. Results are kept (they're small) so the next play is instant.
"""

import asyncio
import logging
import time
from pathlib import Path
from typing import Literal

from app.emby.ports import EmbyApiPort, EmbyNotFoundError

log = logging.getLogger(__name__)

SubtitleStatus = Literal["ready", "pending", "failed"]

EXTRACT_TIMEOUT_S = 600
KEEP_DAYS = 60


class SubtitleCache:
    def __init__(self, api: EmbyApiPort, root: Path) -> None:
        self._api = api
        self._root = root
        root.mkdir(parents=True, exist_ok=True)
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._errors: dict[str, str] = {}

    def _key(self, item_id: str, media_source_id: str, index: int) -> str:
        return f"{item_id}-{media_source_id}-{index}"

    def _path(self, key: str) -> Path:
        return self._root / f"{key}.ass"

    def prune(self, now: float | None = None) -> None:
        """Drops cache files untouched for KEEP_DAYS (run at startup)."""
        cutoff = (now or time.time()) - KEEP_DAYS * 86400
        for f in self._root.glob("*.ass") if self._root.exists() else []:
            if f.stat().st_mtime < cutoff:
                f.unlink(missing_ok=True)

    def status(self, item_id: str, media_source_id: str, index: int, token: str) -> tuple[SubtitleStatus, str | None]:
        """Starts extraction if needed (idempotent) and reports where it stands."""
        key = self._key(item_id, media_source_id, index)
        if self._path(key).exists():
            return "ready", None
        if key in self._errors:
            return "failed", self._errors[key]
        if key not in self._tasks:
            self._tasks[key] = asyncio.create_task(self._fetch(key, item_id, media_source_id, index, token))
        return "pending", None

    async def wait(self, item_id: str, media_source_id: str, index: int, token: str, timeout: float) -> Path | None:
        """The cached file if it's ready within `timeout`, else None (keeps extracting)."""
        state, _ = self.status(item_id, media_source_id, index, token)
        key = self._key(item_id, media_source_id, index)
        if state == "pending":
            try:
                await asyncio.wait_for(asyncio.shield(self._tasks[key]), timeout)
            except (TimeoutError, asyncio.TimeoutError):
                return None
        path = self._path(key)
        if path.exists():
            path.touch()  # keep recently used subtitles past the prune cutoff
            return path
        return None

    async def _fetch(self, key: str, item_id: str, media_source_id: str, index: int, token: str) -> None:
        part = self._root / f"{key}.part"
        try:
            await self._api.download_subtitle(item_id, media_source_id, index, token, part, timeout=EXTRACT_TIMEOUT_S)
            part.rename(self._path(key))
        except EmbyNotFoundError as e:
            log.warning("subtitle %s unavailable: %s", key, e)
            self._errors[key] = str(e)
        except Exception as e:  # network trouble etc.: report as failed, allow a later retry
            log.warning("subtitle %s extraction failed: %s", key, e)
            self._errors[key] = "extraction failed"
            asyncio.get_running_loop().call_later(60, self._errors.pop, key, None)
        finally:
            part.unlink(missing_ok=True)
            self._tasks.pop(key, None)

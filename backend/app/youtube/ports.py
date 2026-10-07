from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class PlaylistEntry:
    video_id: str
    title: str
    channel: str | None
    duration_seconds: int | None


@dataclass(frozen=True)
class PlaylistInfo:
    title: str
    entries: list[PlaylistEntry]


@dataclass(frozen=True)
class DownloadedVideo:
    video_id: str
    title: str
    channel: str
    upload_date: str | None  # YYYYMMDD, as yt-dlp reports it
    description: str
    duration_seconds: int | None
    media_path: Path
    thumbnail_path: Path | None


class SourceUnavailableError(Exception):
    """The source couldn't be read: private/deleted playlist, bad URL, YouTube blocking."""


class DownloadCancelledError(Exception):
    """Raised by a VideoSourcePort.download when should_cancel() turned true mid-way."""


class VideoSourcePort(Protocol):
    """Where videos come from. Today: yt-dlp against YouTube. Methods are blocking —
    the service runs them in a worker thread."""

    def fetch_playlist(self, url: str) -> PlaylistInfo: ...

    def download(self, video_id: str, workdir: Path, should_cancel: Callable[[], bool]) -> DownloadedVideo:
        """Downloads into workdir (a fresh, empty directory owned by the caller)."""
        ...


class MediaLibraryPort(Protocol):
    """The media server that indexes the finished files. Today: Emby."""

    async def notify_new_files(self, paths: list[Path]) -> None:
        """Best-effort nudge to index these paths now. Must not raise — the files are
        already in place and the server will find them on its own schedule anyway."""
        ...

from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Protocol

PlaybackEvent = Literal["start", "progress", "stopped"]


@dataclass(frozen=True)
class EmbyStream:
    index: int  # absolute stream index in the container (Emby's MediaStream.Index)
    type: str  # "Video" | "Audio" | "Subtitle" | ...
    codec: str
    title: str
    language: str | None
    is_default: bool
    is_external: bool
    is_text: bool
    frame_rate: float | None = None  # video streams only
    hdr: bool = False  # video streams only: HDR10 / Dolby Vision / HLG


@dataclass(frozen=True)
class EmbyItem:
    id: str
    name: str
    series_name: str | None
    season_number: int | None
    episode_number: int | None
    runtime_seconds: float | None
    resume_seconds: float  # 0 when no per-user data (no user id) or not started
    media_source_id: str
    streams: list[EmbyStream]


@dataclass(frozen=True)
class PlaybackReport:
    item_id: str
    media_source_id: str
    play_session_id: str
    position_seconds: float
    is_paused: bool = False


class EmbyNotFoundError(Exception):
    """The item/stream doesn't exist or isn't accessible — or Emby didn't answer."""


class EmbyApiPort(Protocol):
    """Emby's HTTP API as the player needs it. `token` is always explicit: either the
    viewer's own access token or the server API key."""

    async def verify_user_token(self, token: str, user_id: str) -> bool: ...

    async def get_item(self, item_id: str, token: str, user_id: str | None) -> EmbyItem: ...

    def stream_input(self, item_id: str, media_source_id: str, token: str) -> tuple[str, dict[str, str]]:
        """(url, headers) for ffmpeg to read the original file; the token rides in a
        header, never the URL."""
        ...

    async def download_subtitle(
        self, item_id: str, media_source_id: str, index: int, token: str, dest: Path, timeout: float = 60
    ) -> None:
        """Saves the subtitle stream converted to .ass (Emby does the conversion; for an
        embedded track it reads through the whole file, hence the timeout)."""
        ...

    async def report_playback(self, event: PlaybackEvent, report: PlaybackReport, token: str) -> None: ...


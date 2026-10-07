from typing import Literal

from pydantic import BaseModel, Field


class TrackOut(BaseModel):
    index: int
    title: str
    language: str | None
    is_default: bool
    # audio | text subtitle (burned in via libass) | image subtitle (PGS/DVD, overlaid)
    kind: Literal["audio", "text", "image"]


class PlaybackItemOut(BaseModel):
    id: str
    name: str
    series_name: str | None
    season_number: int | None
    episode_number: int | None
    runtime_seconds: float | None
    resume_seconds: float
    media_source_id: str
    audio_tracks: list[TrackOut]
    subtitle_tracks: list[TrackOut]


class SubtitleStatusOut(BaseModel):
    # ready: burned in on the next (re)connect · pending: Emby is still extracting it
    # (the player polls, then reconnects) · failed: play on without it
    status: Literal["ready", "pending", "failed"]
    error: str | None = None


class PlaybackReportIn(BaseModel):
    event: Literal["start", "progress", "stopped"]
    media_source_id: str = Field(max_length=100)
    play_session_id: str = Field(max_length=100)
    position_seconds: float = Field(ge=0)
    is_paused: bool = False

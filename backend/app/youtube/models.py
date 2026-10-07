from datetime import datetime, timezone
from enum import Enum

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class VideoStatus(str, Enum):
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    DONE = "done"
    # Three distinct stop reasons, deliberately not collapsed (see AGENTS.md
    # "Background work"): FAILED = the download itself errored (auto-retried up to
    # MAX_ATTEMPTS), CANCELLED = a person asked it to stop (never auto-retried),
    # INTERRUPTED = the process shut down mid-download (always requeued on startup).
    FAILED = "failed"
    CANCELLED = "cancelled"
    INTERRUPTED = "interrupted"


class PlaylistSource(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    url: str = Field(unique=True)
    title: str
    enabled: bool = True
    last_synced_at: datetime | None = None
    last_error: str | None = None
    created_at: datetime = Field(default_factory=utcnow)


class Video(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    # Nullable: deleting a source keeps the videos (and their files) it already pulled.
    source_id: int | None = Field(default=None, foreign_key="playlistsource.id", index=True)
    youtube_id: str = Field(unique=True, index=True)
    title: str
    channel: str | None = None
    duration_seconds: int | None = None
    status: VideoStatus = Field(default=VideoStatus.QUEUED, index=True)
    error: str | None = None
    attempts: int = 0
    file_path: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

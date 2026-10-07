from datetime import datetime

from pydantic import BaseModel, HttpUrl

from app.youtube.models import VideoStatus


class SourceCreate(BaseModel):
    url: HttpUrl


class SourceUpdate(BaseModel):
    enabled: bool | None = None


class SourceOut(BaseModel):
    id: int
    url: str
    title: str
    enabled: bool
    last_synced_at: datetime | None
    last_error: str | None
    created_at: datetime


class SyncResult(BaseModel):
    source_id: int
    new_videos: int
    error: str | None


class VideoOut(BaseModel):
    id: int
    source_id: int | None
    youtube_id: str
    title: str
    channel: str | None
    duration_seconds: int | None
    status: VideoStatus
    error: str | None
    attempts: int
    file_path: str | None
    created_at: datetime
    updated_at: datetime

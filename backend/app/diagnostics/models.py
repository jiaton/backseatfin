from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class CarReport(SQLModel, table=True):
    """One run of the car test page: what the browser is, and which playback paths
    actually worked (as judged by the person watching)."""

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_agent: str
    moving: bool | None = None
    canvas_video: bool | None = None
    canvas_audio: bool | None = None
    video_tag: bool | None = None
    # H.264 via WebCodecs (hardware decode without <video>) showed a moving picture.
    webcodecs_video: bool | None = None
    notes: str = ""
    # Measured by the test page itself (decode cost, hardware support, ...), free text.
    metrics: str = ""

from datetime import datetime

from pydantic import BaseModel, Field


class CarReportCreate(BaseModel):
    moving: bool | None = None
    canvas_video: bool | None = None
    canvas_audio: bool | None = None
    video_tag: bool | None = None
    webcodecs_video: bool | None = None
    notes: str = Field(default="", max_length=2000)
    metrics: str = Field(default="", max_length=4000)


class CarReportOut(CarReportCreate):
    id: int
    created_at: datetime
    user_agent: str

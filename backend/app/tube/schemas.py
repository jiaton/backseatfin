from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class TubeVideoCardOut(_Out):
    id: str
    title: str
    channel_id: str | None = None
    channel_name: str | None = None
    duration_seconds: int | None = None
    view_count: int | None = None
    published_at: datetime | None = None
    thumbnail_url: str | None = None
    is_live: bool = False
    # From the local history, when this video was played before.
    position_seconds: float | None = None


class TubeChannelCardOut(_Out):
    id: str
    name: str
    handle: str | None = None
    avatar_url: str | None = None
    subscriber_count: int | None = None


class TubePlaylistCardOut(_Out):
    id: str
    title: str
    channel_name: str | None = None
    video_count: int | None = None
    thumbnail_url: str | None = None


class TubeSearchOut(BaseModel):
    videos: list[TubeVideoCardOut]
    channels: list[TubeChannelCardOut]
    playlists: list[TubePlaylistCardOut]


class TubeLinkOut(BaseModel):
    kind: str = Field(description='"video", "channel" or "playlist"')
    id: str


class TubeChapterOut(_Out):
    start_seconds: float
    title: str


class TubeVideoOut(BaseModel):
    video: TubeVideoCardOut
    description: str
    chapters: list[TubeChapterOut]
    finished: bool
    later: bool
    following: bool


class TubeProgressIn(BaseModel):
    position_seconds: float = Field(ge=0)
    duration_seconds: float | None = Field(default=None, ge=0)


class TubeChannelOut(BaseModel):
    channel: TubeChannelCardOut
    banner_url: str | None
    description: str
    videos: list[TubeVideoCardOut]
    following: bool


class TubePlaylistOut(BaseModel):
    playlist: TubePlaylistCardOut
    videos: list[TubeVideoCardOut]
    following: bool


class TubePlaylistShelfOut(BaseModel):
    """A followed playlist's newest videos (newest added first)."""

    playlist: TubePlaylistCardOut
    videos: list[TubeVideoCardOut]


class TubeHomeOut(BaseModel):
    continue_watching: list[TubeVideoCardOut]
    playlists: list[TubePlaylistShelfOut]
    feed: list[TubeVideoCardOut]
    recommended: list[TubeVideoCardOut]
    later: list[TubeVideoCardOut]


class TubeFollowingOut(BaseModel):
    channels: list[TubeChannelCardOut]
    playlists: list[TubePlaylistCardOut]

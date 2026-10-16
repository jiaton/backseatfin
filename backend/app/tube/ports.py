"""What the tube domain needs from the outside world: YouTube (via yt-dlp), YouTube's
channel feeds, and plain HTTP (thumbnails, checking a stream URL still works)."""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Protocol


class TubeUnavailableError(Exception):
    """YouTube refused or doesn't have it (private, removed, region-locked, bad id)."""


class SearchKind(str, Enum):
    VIDEOS = "videos"
    CHANNELS = "channels"
    PLAYLISTS = "playlists"


@dataclass(frozen=True)
class VideoCard:
    id: str
    title: str
    channel_id: str | None = None
    channel_name: str | None = None
    duration_seconds: int | None = None
    view_count: int | None = None
    published_at: datetime | None = None
    thumbnail_url: str | None = None
    is_live: bool = False


@dataclass(frozen=True)
class ChannelCard:
    id: str
    name: str
    handle: str | None = None
    avatar_url: str | None = None
    subscriber_count: int | None = None


@dataclass(frozen=True)
class PlaylistCard:
    id: str
    title: str
    channel_name: str | None = None
    video_count: int | None = None
    thumbnail_url: str | None = None


@dataclass(frozen=True)
class SearchResults:
    videos: list[VideoCard] = field(default_factory=list)
    channels: list[ChannelCard] = field(default_factory=list)
    playlists: list[PlaylistCard] = field(default_factory=list)


@dataclass(frozen=True)
class Chapter:
    start_seconds: float
    title: str


@dataclass(frozen=True)
class MediaFormat:
    """One stream YouTube offers for a video. url is bound to our server's IP and
    expires after a few hours."""

    format_id: str
    url: str
    vcodec: str | None  # None = audio only
    acodec: str | None  # None = video only
    height: int | None = None
    width: int | None = None
    kbps: float | None = None
    protocol: str = "https"


@dataclass(frozen=True)
class CaptionTrack:
    """A subtitle track YouTube has for a video: the uploader's (`auto` False) or its
    automatic captions / their machine translation (`auto` True)."""

    id: str  # "sub:<lang>" or "auto:<lang>"
    lang: str
    label: str
    auto: bool
    url: str  # json3 format


@dataclass(frozen=True)
class Cue:
    start: float
    end: float
    text: str


@dataclass(frozen=True)
class VideoDetails:
    card: VideoCard
    description: str = ""
    chapters: list[Chapter] = field(default_factory=list)
    channel_avatar_url: str | None = None
    formats: list[MediaFormat] = field(default_factory=list)
    captions: list[CaptionTrack] = field(default_factory=list)
    # When the format URLs stop working (unix seconds), as YouTube states it.
    expires_at: float | None = None


@dataclass(frozen=True)
class ChannelPage:
    channel: ChannelCard
    banner_url: str | None
    description: str
    videos: list[VideoCard]


@dataclass(frozen=True)
class PlaylistPage:
    playlist: PlaylistCard
    videos: list[VideoCard]


class TubeSourcePort(Protocol):
    """YouTube as yt-dlp sees it. Blocking calls (run them in a thread)."""

    def search(self, query: str, kind: SearchKind, limit: int) -> SearchResults: ...

    def video(self, video_id: str) -> VideoDetails: ...

    def channel(self, channel_id: str, limit: int) -> ChannelPage: ...

    def playlist(self, playlist_id: str, limit: int) -> PlaylistPage: ...


class TubeWebPort(Protocol):
    """Plain HTTP to YouTube's hosts."""

    async def channel_feed(self, channel_id: str) -> list[VideoCard]:
        """The channel's newest uploads (about 15) with publish dates, from its RSS feed."""
        ...

    async def fetch_image(self, url: str) -> tuple[bytes, str]:
        """(bytes, content type) of a thumbnail or avatar."""
        ...

    async def fetch_text(self, url: str) -> str:
        """A caption track's content."""
        ...

    async def url_works(self, url: str) -> bool:
        """Whether a stream URL still answers (it expires, or YouTube revokes it)."""
        ...

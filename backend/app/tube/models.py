"""What BackseatFin remembers about YouTube, all local: followed channels, their recent
uploads (for the home feed), what was watched and how far, and "watch later"."""

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class FollowedChannel(SQLModel, table=True):
    channel_id: str = Field(primary_key=True)
    name: str
    avatar_url: str | None = None
    followed_at: datetime = Field(default_factory=utcnow)
    last_checked_at: datetime | None = None
    last_error: str | None = None


class FeedVideo(SQLModel, table=True):
    """A recent upload of a followed channel (kept while the channel is followed)."""

    video_id: str = Field(primary_key=True)
    channel_id: str = Field(index=True)
    channel_name: str | None = None
    title: str
    # None until YouTube's feed has said (see library.refresh_channel).
    published_at: datetime | None = Field(default=None, index=True)
    # When we first saw it: orders videos whose publish date isn't known yet.
    seen_at: datetime = Field(default_factory=utcnow)
    duration_seconds: int | None = None
    view_count: int | None = None


class WatchedVideo(SQLModel, table=True):
    """Playback history and the resume position."""

    video_id: str = Field(primary_key=True)
    title: str
    channel_id: str | None = None
    channel_name: str | None = None
    duration_seconds: int | None = None
    position_seconds: float = 0
    finished: bool = False
    watched_at: datetime = Field(default_factory=utcnow, index=True)


class LaterVideo(SQLModel, table=True):
    video_id: str = Field(primary_key=True)
    title: str
    channel_id: str | None = None
    channel_name: str | None = None
    duration_seconds: int | None = None
    added_at: datetime = Field(default_factory=utcnow, index=True)


class FollowedPlaylist(SQLModel, table=True):
    """A YouTube playlist (public or unlisted) whose videos show on the home screen:
    add a video to it on the phone, and it's in the car."""

    playlist_id: str = Field(primary_key=True)
    title: str
    channel_name: str | None = None
    followed_at: datetime = Field(default_factory=utcnow)
    last_checked_at: datetime | None = None
    last_error: str | None = None


class PlaylistItem(SQLModel, table=True):
    playlist_id: str = Field(primary_key=True)
    video_id: str = Field(primary_key=True)
    title: str
    channel_id: str | None = None
    channel_name: str | None = None
    duration_seconds: int | None = None
    # When it first showed up in the playlist (as far as we know): newest first on home.
    seen_at: datetime = Field(default_factory=utcnow, index=True)


class SearchQuery(SQLModel, table=True):
    """What was searched (for recommendations), lower-cased."""

    query: str = Field(primary_key=True)
    count: int = 1
    last_at: datetime = Field(default_factory=utcnow, index=True)

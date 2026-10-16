"""Mapping stored rows and YouTube cards to API shapes (shared by both routers)."""

from collections.abc import Iterable

from fastapi import HTTPException, status
from sqlmodel import Session

from app.container import tube_library
from app.tube.models import FeedVideo, FollowedChannel, FollowedPlaylist, LaterVideo, PlaylistItem, WatchedVideo
from app.tube.ports import TubeUnavailableError, VideoCard
from app.tube.schemas import TubeChannelCardOut, TubePlaylistCardOut, TubeVideoCardOut
from app.tube.service import InvalidIdError
from app.tube.urls import video_thumbnail


def http_error(e: Exception) -> HTTPException:
    if isinstance(e, InvalidIdError):
        return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))
    if isinstance(e, TubeUnavailableError):
        # 404, not 5xx: YouTube said no (private, removed…); the page shows the reason.
        return HTTPException(status.HTTP_404_NOT_FOUND, str(e))
    raise TypeError(f"unmapped error {e!r}")


def cards(session: Session, videos: Iterable[VideoCard]) -> list[TubeVideoCardOut]:
    return [
        TubeVideoCardOut.model_validate(c).model_copy(update={"position_seconds": tube_library.resume_position(session, c.id)})
        for c in videos
    ]


def stored(session: Session, row: WatchedVideo | LaterVideo | FeedVideo | PlaylistItem) -> TubeVideoCardOut:
    return TubeVideoCardOut(
        id=row.video_id, title=row.title, channel_id=row.channel_id, channel_name=row.channel_name,
        duration_seconds=row.duration_seconds, thumbnail_url=video_thumbnail(row.video_id),
        position_seconds=tube_library.resume_position(session, row.video_id),
        published_at=getattr(row, "published_at", None), view_count=getattr(row, "view_count", None),
    )


def channel_card(row: FollowedChannel) -> TubeChannelCardOut:
    return TubeChannelCardOut(id=row.channel_id, name=row.name, avatar_url=row.avatar_url)


def playlist_card(row: FollowedPlaylist, first_video: str | None = None) -> TubePlaylistCardOut:
    return TubePlaylistCardOut(
        id=row.playlist_id, title=row.title, channel_name=row.channel_name,
        thumbnail_url=video_thumbnail(first_video) if first_video else None,
    )

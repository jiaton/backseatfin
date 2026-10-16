from collections.abc import Iterable

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlmodel import Session

from app.auth.deps import require_auth
from app.container import tube_library, tube_service
from app.core.db import get_session
from app.tube.library import NotFollowingError
from app.tube.models import FeedVideo, FollowedChannel, LaterVideo, WatchedVideo
from app.tube.ports import SearchKind, TubeUnavailableError, VideoCard
from app.tube.schemas import (
    TubeChannelCardOut,
    TubeChannelOut,
    TubeHomeOut,
    TubeLinkOut,
    TubePlaylistOut,
    TubeProgressIn,
    TubeSearchOut,
    TubeVideoCardOut,
    TubeVideoOut,
)
from app.tube.service import InvalidIdError
from app.tube.urls import parse_link, video_thumbnail

router = APIRouter(prefix="/api/tube", tags=["tube"], dependencies=[Depends(require_auth)])

HOME_ROW = 24


def _http(e: Exception) -> HTTPException:
    if isinstance(e, InvalidIdError):
        return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))
    if isinstance(e, TubeUnavailableError):
        # 404, not 5xx: YouTube said no (private, removed…); the player shows the reason.
        return HTTPException(status.HTTP_404_NOT_FOUND, str(e))
    raise TypeError(f"unmapped error {e!r}")


def _cards(session: Session, cards: Iterable[VideoCard]) -> list[TubeVideoCardOut]:
    return [
        TubeVideoCardOut.model_validate(c).model_copy(update={"position_seconds": tube_library.resume_position(session, c.id)})
        for c in cards
    ]


def _stored(row: WatchedVideo | LaterVideo | FeedVideo, position: float | None = None) -> TubeVideoCardOut:
    return TubeVideoCardOut(
        id=row.video_id, title=row.title, channel_id=row.channel_id, channel_name=row.channel_name,
        duration_seconds=row.duration_seconds, thumbnail_url=video_thumbnail(row.video_id), position_seconds=position,
        published_at=getattr(row, "published_at", None), view_count=getattr(row, "view_count", None),
    )


def _channel_card(row: FollowedChannel) -> TubeChannelCardOut:
    return TubeChannelCardOut(id=row.channel_id, name=row.name, avatar_url=row.avatar_url)


@router.get("/home", response_model=TubeHomeOut)
async def home(session: Session = Depends(get_session)):
    # async: prefetch starts a task on the event loop (a sync route runs in a thread).
    continuing = tube_library.continue_watching(session, HOME_ROW)
    if continuing:
        tube_service.prefetch(continuing[0].video_id)  # the likeliest next Play
    return TubeHomeOut(
        continue_watching=[_stored(w, w.position_seconds) for w in continuing],
        feed=[_stored(f, tube_library.resume_position(session, f.video_id)) for f in tube_library.feed(session, HOME_ROW * 2)],
        later=[_stored(v, tube_library.resume_position(session, v.video_id)) for v in tube_library.later(session)],
        following=[_channel_card(c) for c in tube_library.followed(session)],
    )


@router.get("/search", response_model=TubeSearchOut)
async def search(q: str = Query(min_length=1, max_length=200), kind: SearchKind = SearchKind.VIDEOS,
                 session: Session = Depends(get_session)):
    try:
        results = await tube_service.search(q, kind)
    except TubeUnavailableError as e:
        raise _http(e) from e
    return TubeSearchOut(
        videos=_cards(session, results.videos),
        channels=[TubeChannelCardOut.model_validate(c) for c in results.channels],
        playlists=results.playlists,
    )


@router.get("/link", response_model=TubeLinkOut)
def link(url: str = Query(min_length=1, max_length=500)):
    """What a pasted YouTube link points at."""
    parsed = parse_link(url)
    if parsed is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "not a YouTube video, channel or playlist link")
    return TubeLinkOut(kind=parsed[0], id=parsed[1])


@router.get("/videos/{video_id}", response_model=TubeVideoOut)
async def video(video_id: str, session: Session = Depends(get_session)):
    try:
        details = await tube_service.video(video_id)
    except (InvalidIdError, TubeUnavailableError) as e:
        raise _http(e) from e
    watched = tube_library.watched(session, video_id)
    return TubeVideoOut(
        video=_cards(session, [details.card])[0],
        description=details.description,
        chapters=details.chapters,
        finished=bool(watched and watched.finished),
        later=tube_library.is_later(session, video_id),
        following=bool(details.card.channel_id and tube_library.is_following(session, details.card.channel_id)),
    )


@router.post("/videos/{video_id}/progress", status_code=status.HTTP_204_NO_CONTENT)
async def progress(video_id: str, body: TubeProgressIn, session: Session = Depends(get_session)):
    try:
        details = await tube_service.video(video_id)
    except (InvalidIdError, TubeUnavailableError) as e:
        raise _http(e) from e
    tube_library.record_progress(session, details.card, body.position_seconds, body.duration_seconds)


@router.delete("/history/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
def forget(video_id: str, session: Session = Depends(get_session)):
    tube_library.forget(session, video_id)


@router.get("/history", response_model=list[TubeVideoCardOut])
def history(session: Session = Depends(get_session)):
    return [_stored(w, None if w.finished else w.position_seconds) for w in tube_library.history(session)]


@router.put("/later/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
async def add_later(video_id: str, session: Session = Depends(get_session)):
    try:
        details = await tube_service.video(video_id)
    except (InvalidIdError, TubeUnavailableError) as e:
        raise _http(e) from e
    tube_library.add_later(session, details.card)


@router.delete("/later/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_later(video_id: str, session: Session = Depends(get_session)):
    tube_library.remove_later(session, video_id)


@router.get("/channels/{channel_id}", response_model=TubeChannelOut)
async def channel(channel_id: str, session: Session = Depends(get_session)):
    try:
        page = await tube_service.channel(channel_id)
    except (InvalidIdError, TubeUnavailableError) as e:
        raise _http(e) from e
    return TubeChannelOut(
        channel=TubeChannelCardOut.model_validate(page.channel), banner_url=page.banner_url, description=page.description,
        videos=_cards(session, page.videos), following=tube_library.is_following(session, page.channel.id),
    )


@router.put("/channels/{channel_id}/follow", response_model=TubeChannelCardOut)
async def follow(channel_id: str, session: Session = Depends(get_session)):
    try:
        return _channel_card(await tube_library.follow(session, channel_id))
    except (InvalidIdError, TubeUnavailableError) as e:
        raise _http(e) from e


@router.delete("/channels/{channel_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
def unfollow(channel_id: str, session: Session = Depends(get_session)):
    try:
        tube_library.unfollow(session, channel_id)
    except NotFollowingError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not following that channel") from e


@router.get("/playlists/{playlist_id}", response_model=TubePlaylistOut)
async def playlist(playlist_id: str, session: Session = Depends(get_session)):
    try:
        page = await tube_service.playlist(playlist_id)
    except (InvalidIdError, TubeUnavailableError) as e:
        raise _http(e) from e
    return TubePlaylistOut(playlist=page.playlist, videos=_cards(session, page.videos))


@router.get("/image", response_class=Response, responses={200: {"content": {"image/jpeg": {}}}})
async def image(u: str = Query(max_length=1000)):
    """A YouTube thumbnail or avatar, fetched by the server so the car never contacts
    Google for it."""
    try:
        data, content_type = await tube_service.image(u)
    except (InvalidIdError, TubeUnavailableError) as e:
        raise _http(e) from e
    return Response(data, media_type=content_type, headers={"Cache-Control": "private, max-age=604800, immutable"})

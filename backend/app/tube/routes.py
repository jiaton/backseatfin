"""Browsing YouTube: search, links, videos, channels, playlists, images."""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlmodel import Session

from app.auth.deps import require_auth
from app.container import playlist_library, recommender, tube_library, tube_service
from app.core.db import get_session
from app.tube.ports import SearchKind, TubeUnavailableError
from app.tube.schemas import TubeChannelCardOut, TubeChannelOut, TubeLinkOut, TubePlaylistOut, TubeProgressIn, TubeSearchOut, TubeVideoOut
from app.tube.service import InvalidIdError
from app.tube.urls import parse_link
from app.tube.views import cards, http_error

router = APIRouter(prefix="/api/tube", tags=["tube"], dependencies=[Depends(require_auth)])


@router.get("/search", response_model=TubeSearchOut)
async def search(q: str = Query(min_length=1, max_length=200), kind: SearchKind = SearchKind.VIDEOS,
                 session: Session = Depends(get_session)):
    try:
        results = await tube_service.search(q, kind)
    except TubeUnavailableError as e:
        raise http_error(e) from e
    recommender.record_search(session, q)
    return TubeSearchOut(
        videos=cards(session, results.videos),
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
        raise http_error(e) from e
    watched = tube_library.watched(session, video_id)
    return TubeVideoOut(
        video=cards(session, [details.card])[0],
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
        raise http_error(e) from e
    if details.card.is_live:
        return  # nothing to resume in a live stream
    first_time = tube_library.watched(session, video_id) is None
    tube_library.record_progress(session, details.card, body.position_seconds, body.duration_seconds)
    if first_time:
        recommender.invalidate()


@router.get("/channels/{channel_id}", response_model=TubeChannelOut)
async def channel(channel_id: str, session: Session = Depends(get_session)):
    try:
        page = await tube_service.channel(channel_id)
    except (InvalidIdError, TubeUnavailableError) as e:
        raise http_error(e) from e
    return TubeChannelOut(
        channel=TubeChannelCardOut.model_validate(page.channel), banner_url=page.banner_url, description=page.description,
        videos=cards(session, page.videos), following=tube_library.is_following(session, page.channel.id),
    )


@router.get("/playlists/{playlist_id}", response_model=TubePlaylistOut)
async def playlist(playlist_id: str, session: Session = Depends(get_session)):
    try:
        page = await tube_service.playlist(playlist_id)
    except (InvalidIdError, TubeUnavailableError) as e:
        raise http_error(e) from e
    return TubePlaylistOut(
        playlist=page.playlist, videos=cards(session, page.videos),
        following=playlist_library.is_following(session, playlist_id),
    )


@router.get("/image", response_class=Response, responses={200: {"content": {"image/jpeg": {}}}})
async def image(u: str = Query(max_length=1000)):
    """A YouTube thumbnail or avatar, fetched by the server so the car never contacts
    Google for it."""
    try:
        data, content_type = await tube_service.image(u)
    except (InvalidIdError, TubeUnavailableError) as e:
        raise http_error(e) from e
    return Response(data, media_type=content_type, headers={"Cache-Control": "private, max-age=604800, immutable"})

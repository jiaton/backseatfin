"""The household's own YouTube library: home, history, watch later, following."""

import asyncio
import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.auth.deps import require_auth
from app.container import playlist_library, recommender, tube_library, tube_service
from app.core.db import get_session
from app.tube.library import NotFollowingError
from app.tube.ports import TubeUnavailableError
from app.tube.schemas import TubeChannelCardOut, TubeFollowingOut, TubeHomeOut, TubePlaylistCardOut, TubePlaylistShelfOut, TubeVideoCardOut
from app.tube.service import InvalidIdError
from app.tube.views import cards, channel_card, http_error, playlist_card, stored

router = APIRouter(prefix="/api/tube", tags=["tube"], dependencies=[Depends(require_auth)])

# Rows on the home screen stay short (about two rows of four on the car's screen); the
# title of a playlist row leads to all of it.
HOME_ROW = 8
FEED_ROW = 12
# Re-reading followed playlists on open is worth a short wait, not a long one.
PLAYLIST_REFRESH_WAIT_S = 4.0


@router.get("/home", response_model=TubeHomeOut)
async def home(session: Session = Depends(get_session)):
    # async: prefetch and recommendations start tasks on the event loop.
    try:
        await asyncio.wait_for(playlist_library.refresh_stale_playlists(session), PLAYLIST_REFRESH_WAIT_S)
    except TimeoutError:
        pass  # what we have; the rest arrives next time
    continuing = tube_library.continue_watching(session, HOME_ROW)
    feed = tube_library.feed(session, FEED_ROW)
    later = tube_library.later(session)[:HOME_ROW]
    if continuing:
        tube_service.prefetch(continuing[0].video_id)  # the likeliest next Play
    shelves = []
    for p in playlist_library.followed(session):
        items = playlist_library.items(session, p.playlist_id, HOME_ROW)
        shelves.append(TubePlaylistShelfOut(
            playlist=playlist_card(p, items[0].video_id if items else None), videos=[stored(session, i) for i in items],
        ))
    # Recommendations are cached for a while: never repeat what another row shows now.
    shown = {r.video_id for r in [*continuing, *feed, *later]} | {v.id for shelf in shelves for v in shelf.videos}
    recommended = [c for c in await recommender.recommendations(session) if c.id not in shown][:FEED_ROW]
    return TubeHomeOut(
        continue_watching=[stored(session, w) for w in continuing],
        playlists=shelves,
        feed=[stored(session, f) for f in feed],
        recommended=cards(session, recommended),
        later=[stored(session, v) for v in later],
    )


# What plays next when a video ends: a YouTube playlist (its order), a followed
# playlist's home row (newest added first), or "watch later".
PLAY_LIST = re.compile(r"^(?:(playlist|shelf):([A-Za-z0-9_-]{10,64})|(later))$")


@router.get("/next", response_model=TubeVideoCardOut | None)
async def next_video(
    play_list: str = Query(alias="list", max_length=80), after: str = Query(max_length=20),
    session: Session = Depends(get_session),
):
    """The video after `after` in that list (null at its end)."""
    m = PLAY_LIST.match(play_list)
    if m is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "unknown list")
    kind, playlist_id, later = m.groups()
    if later:
        order = [stored(session, v) for v in tube_library.later(session)]
    elif kind == "shelf":
        order = [stored(session, i) for i in playlist_library.items(session, playlist_id, 500)]
    else:
        try:
            order = cards(session, (await tube_service.playlist(playlist_id)).videos)
        except (InvalidIdError, TubeUnavailableError) as e:
            raise http_error(e) from e
    ids = [v.id for v in order]
    if after not in ids:
        return None
    rest = order[ids.index(after) + 1:]
    return next((v for v in rest if not v.is_live), None)


@router.get("/following", response_model=TubeFollowingOut)
def following(session: Session = Depends(get_session)):
    return TubeFollowingOut(
        channels=[channel_card(c) for c in tube_library.followed(session)],
        playlists=[playlist_card(p) for p in playlist_library.followed(session)],
    )


@router.get("/history", response_model=list[TubeVideoCardOut])
def history(session: Session = Depends(get_session)):
    return [stored(session, w) for w in tube_library.history(session)]


@router.delete("/history/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
def forget(video_id: str, session: Session = Depends(get_session)):
    tube_library.forget(session, video_id)


@router.put("/later/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
async def add_later(video_id: str, session: Session = Depends(get_session)):
    try:
        details = await tube_service.video(video_id)
    except (InvalidIdError, TubeUnavailableError) as e:
        raise http_error(e) from e
    tube_library.add_later(session, details.card)


@router.delete("/later/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_later(video_id: str, session: Session = Depends(get_session)):
    tube_library.remove_later(session, video_id)


@router.put("/channels/{channel_id}/follow", response_model=TubeChannelCardOut)
async def follow_channel(channel_id: str, session: Session = Depends(get_session)):
    try:
        row = await tube_library.follow(session, channel_id)
    except (InvalidIdError, TubeUnavailableError) as e:
        raise http_error(e) from e
    recommender.invalidate()
    return channel_card(row)


@router.delete("/channels/{channel_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
def unfollow_channel(channel_id: str, session: Session = Depends(get_session)):
    try:
        tube_library.unfollow(session, channel_id)
    except NotFollowingError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not following that channel") from e
    recommender.invalidate()


@router.put("/playlists/{playlist_id}/follow", response_model=TubePlaylistCardOut)
async def follow_playlist(playlist_id: str, session: Session = Depends(get_session)):
    try:
        row = await playlist_library.follow(session, playlist_id)
    except (InvalidIdError, TubeUnavailableError) as e:
        raise http_error(e) from e
    recommender.invalidate()
    items = playlist_library.items(session, playlist_id, 1)
    return playlist_card(row, items[0].video_id if items else None)


@router.delete("/playlists/{playlist_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
def unfollow_playlist(playlist_id: str, session: Session = Depends(get_session)):
    try:
        playlist_library.unfollow(session, playlist_id)
    except NotFollowingError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not following that playlist") from e

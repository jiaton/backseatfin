from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.deps import require_player, viewer_for
from app.auth.service import Principal
from app.container import emby_playback
from app.emby.ports import PlaybackReport
from app.emby.schemas import PlaybackItemOut, PlaybackReportIn, SubtitleStatusOut, TrackOut
from app.stream.ports import SourceUnavailableError

router = APIRouter(prefix="/api/emby", tags=["emby"])


@router.get("/items/{item_id}", response_model=PlaybackItemOut)
async def get_playback_item(item_id: str, principal: Principal = Depends(require_player)):
    try:
        item = await emby_playback.get_item(item_id, viewer_for(principal))
    except SourceUnavailableError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e)) from e
    return PlaybackItemOut(
        id=item.id,
        name=item.name,
        series_name=item.series_name,
        season_number=item.season_number,
        episode_number=item.episode_number,
        runtime_seconds=item.runtime_seconds,
        resume_seconds=item.resume_seconds,
        media_source_id=item.media_source_id,
        audio_tracks=[
            TrackOut(index=s.index, title=s.title, language=s.language, is_default=s.is_default, kind="audio")
            for s in item.streams
            if s.type == "Audio" and not s.is_external
        ],
        subtitle_tracks=[
            TrackOut(
                index=s.index, title=s.title, language=s.language, is_default=s.is_default,
                kind="text" if (s.is_text or s.is_external) else "image",
            )
            for s in item.streams
            if s.type == "Subtitle"
        ],
    )


@router.post("/items/{item_id}/subtitles/{index}/prepare", response_model=SubtitleStatusOut)
async def prepare_subtitle(
    item_id: str,
    index: int,
    media_source_id: str = Query(..., max_length=100),
    principal: Principal = Depends(require_player),
):
    """Starts extracting a text subtitle if it isn't cached yet (idempotent) and says
    whether it's ready. The player polls this after picking a text subtitle."""
    state, error = emby_playback.subtitle_status(item_id, media_source_id, index, viewer_for(principal))
    return SubtitleStatusOut(status=state, error=error)


@router.post("/items/{item_id}/playback", status_code=status.HTTP_204_NO_CONTENT)
async def report_playback(item_id: str, body: PlaybackReportIn, principal: Principal = Depends(require_player)):
    report = PlaybackReport(
        item_id=item_id,
        media_source_id=body.media_source_id,
        play_session_id=body.play_session_id,
        position_seconds=body.position_seconds,
        is_paused=body.is_paused,
    )
    try:
        await emby_playback.report(body.event, report, viewer_for(principal))
    except SourceUnavailableError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e

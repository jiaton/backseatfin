from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.container import playlist_service, video_service
from app.auth.deps import require_auth
from app.core.db import get_session
from app.youtube.models import VideoStatus
from app.youtube.schemas import SourceCreate, SourceOut, SourceUpdate, SyncResult, VideoOut
from app.youtube.ports import SourceUnavailableError
from app.youtube.service import ConflictError, NotFoundError

router = APIRouter(prefix="/api/youtube", tags=["youtube"], dependencies=[Depends(require_auth)])


def _http(e: NotFoundError | ConflictError | SourceUnavailableError) -> HTTPException:
    if isinstance(e, NotFoundError):
        return HTTPException(status.HTTP_404_NOT_FOUND, str(e))
    if isinstance(e, ConflictError):
        return HTTPException(status.HTTP_409_CONFLICT, str(e))
    if isinstance(e, SourceUnavailableError):
        return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"cannot read that playlist: {e}")
    raise TypeError(f"unmapped error {e!r}")


@router.get("/sources", response_model=list[SourceOut])
def list_sources(session: Session = Depends(get_session)):
    return playlist_service.list_sources(session)


@router.post("/sources", response_model=SourceOut, status_code=status.HTTP_201_CREATED)
async def add_source(body: SourceCreate, session: Session = Depends(get_session)):
    try:
        return await playlist_service.add_source(session, str(body.url))
    except (ConflictError, SourceUnavailableError) as e:
        raise _http(e) from e


@router.patch("/sources/{source_id}", response_model=SourceOut)
def update_source(source_id: int, body: SourceUpdate, session: Session = Depends(get_session)):
    try:
        if body.enabled is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "nothing to update")
        return playlist_service.set_enabled(session, source_id, body.enabled)
    except (NotFoundError, ConflictError) as e:
        raise _http(e) from e


@router.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_source(source_id: int, session: Session = Depends(get_session)):
    try:
        playlist_service.delete_source(session, source_id)
    except NotFoundError as e:
        raise _http(e) from e


@router.post("/sources/{source_id}/sync", response_model=SyncResult)
async def sync_source(source_id: int, session: Session = Depends(get_session)):
    try:
        new, err = await playlist_service.sync_source(session, source_id)
    except NotFoundError as e:
        raise _http(e) from e
    return SyncResult(source_id=source_id, new_videos=new, error=err)


@router.get("/videos", response_model=list[VideoOut])
def list_videos(
    status_filter: VideoStatus | None = Query(None, alias="status"),
    limit: int = Query(200, ge=1, le=1000),
    session: Session = Depends(get_session),
):
    return video_service.list_videos(session, status_filter, limit)


@router.post("/videos/{video_id}/retry", response_model=VideoOut)
def retry_video(video_id: int, session: Session = Depends(get_session)):
    try:
        return video_service.retry(session, video_id)
    except (NotFoundError, ConflictError) as e:
        raise _http(e) from e


@router.post("/videos/{video_id}/cancel", response_model=VideoOut)
def cancel_video(video_id: int, session: Session = Depends(get_session)):
    try:
        return video_service.cancel(session, video_id)
    except (NotFoundError, ConflictError) as e:
        raise _http(e) from e

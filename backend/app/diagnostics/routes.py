from fastapi import APIRouter, Depends, Header, Query
from sqlmodel import Session

from app.auth.deps import require_auth
from app.core.db import get_session
from app.diagnostics import service
from app.diagnostics.schemas import CarReportCreate, CarReportOut

router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"], dependencies=[Depends(require_auth)])


@router.post("/car-reports", response_model=CarReportOut, status_code=201)
def create_car_report(
    body: CarReportCreate,
    user_agent: str = Header(default=""),
    session: Session = Depends(get_session),
):
    return service.create_report(session, body, user_agent)


@router.get("/car-reports", response_model=list[CarReportOut])
def list_car_reports(limit: int = Query(50, ge=1, le=500), session: Session = Depends(get_session)):
    return service.list_reports(session, limit)

from collections.abc import Sequence

from sqlmodel import Session, col, select

from app.diagnostics.models import CarReport
from app.diagnostics.schemas import CarReportCreate


def create_report(session: Session, body: CarReportCreate, user_agent: str) -> CarReport:
    report = CarReport(user_agent=user_agent[:1000], **body.model_dump())
    session.add(report)
    session.commit()
    session.refresh(report)
    return report


def list_reports(session: Session, limit: int) -> Sequence[CarReport]:
    return session.exec(select(CarReport).order_by(col(CarReport.created_at).desc()).limit(limit)).all()

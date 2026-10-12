from pathlib import Path

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

Path(settings.database_path).parent.mkdir(parents=True, exist_ok=True)
engine = create_engine(
    f"sqlite:///{settings.database_path}",
    # The download worker and sync loop touch the DB from worker threads.
    connect_args={"check_same_thread": False},
)


def _ensure_column(table: str, column: str, ddl_type: str) -> None:
    """Poor-man's migration for purely additive columns (no migration tool here, see
    AGENTS.md "Data access"). Only "add a nullable/defaulted column"; anything else is
    a manual fixup. table/column/ddl_type are code constants, never user input."""
    with engine.begin() as conn:
        existing = {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})"))}
        if existing and column not in existing:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"))


def init_db() -> None:
    # Import table modules so their metadata is registered before create_all.
    import app.auth.models  # noqa: F401
    import app.diagnostics.models  # noqa: F401
    import app.tube.models  # noqa: F401
    import app.youtube.models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _ensure_column("carreport", "webcodecs_video", "BOOLEAN")
    _ensure_column("carreport", "metrics", "TEXT NOT NULL DEFAULT ''")


def get_session():
    with Session(engine) as session:
        yield session

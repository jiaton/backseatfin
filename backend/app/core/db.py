from pathlib import Path

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

Path(settings.database_path).parent.mkdir(parents=True, exist_ok=True)
engine = create_engine(
    f"sqlite:///{settings.database_path}",
    # Background loops and thread-pool routes touch the DB from other threads.
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
    import app.tube.models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _drop_removed_tables()


# Tables of features that are gone (0.2: YouTube → Emby downloads and the car test
# page). Downloaded files on disk are left alone.
REMOVED_TABLES = ("video", "playlistsource", "carreport")


def _drop_removed_tables() -> None:
    with engine.begin() as conn:
        for table in REMOVED_TABLES:  # code constants, never user input
            conn.execute(text(f"DROP TABLE IF EXISTS {table}"))


def get_session():
    with Session(engine) as session:
        yield session

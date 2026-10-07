import os
import tempfile

# Settings are read at import time; force a throwaway DB and a known key before any app
# module loads — overriding, not defaulting, since in CI the container's env_file carries
# the real values. Each test still gets its own in-memory engine via the fixture below.
os.environ["API_KEY"] = "test-key"
os.environ["DATABASE_PATH"] = os.path.join(tempfile.mkdtemp(), "import.db")
os.environ["EMBY_API_KEY"] = ""

import pytest  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session, SQLModel, create_engine  # noqa: E402

import app.diagnostics.models  # noqa: E402,F401
import app.youtube.models  # noqa: E402,F401


@pytest.fixture
def engine():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(eng)
    return eng


@pytest.fixture
def session_factory(engine):
    return lambda: Session(engine)

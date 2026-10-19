import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.auth.routes import router as auth_router
from sqlmodel import Session

from app.auth import setup_codes
from app.container import feed_refresh_loop, subtitle_cache
from app.core.db import engine, init_db
from app.emby.routes import router as emby_router
from app.stream.routes import router as stream_router
from app.tube.library_routes import router as tube_library_router
from app.tube.routes import router as tube_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("backseatfin")


def _first_start_code() -> None:
    """No device signed in yet: print a one-time code to sign in the first phone with
    (the one credential that is ever logged: it works once, for 24 h)."""
    with Session(engine) as session:
        if setup_codes.has_devices(session):
            return
        code = setup_codes.issue(session, setup_codes.FIRST_START_TTL)
    log.info("No device signed in yet. Setup code: %s (works once, for 24 hours). Open BackseatFin on "
             "your phone and choose \"Sign in with a setup code\". A new one: docker compose exec backend "
             "backseatfin-code", code)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _first_start_code()
    subtitle_cache.prune()
    feed_refresh_loop.start()
    yield
    await feed_refresh_loop.stop()


app = FastAPI(title="BackseatFin", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(stream_router)
app.include_router(tube_router)
app.include_router(tube_library_router)
app.include_router(emby_router)


@app.get("/health")
def health():
    return {"status": "ok"}

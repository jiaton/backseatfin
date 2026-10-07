import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.auth.routes import router as auth_router
from app.container import download_worker, playlist_sync_loop, subtitle_cache
from app.core.db import init_db
from app.diagnostics.routes import router as diagnostics_router
from app.emby.routes import router as emby_router
from app.stream.routes import router as stream_router
from app.youtube.routes import router as youtube_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    subtitle_cache.prune()
    download_worker.start()
    playlist_sync_loop.start()
    yield
    await playlist_sync_loop.stop()
    await download_worker.stop()


app = FastAPI(title="BackseatFin", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(youtube_router)
app.include_router(stream_router)
app.include_router(diagnostics_router)
app.include_router(emby_router)


@app.get("/health")
def health():
    return {"status": "ok"}

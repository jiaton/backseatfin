"""Composition root: the one place concrete adapters are chosen and handed to services.
Routes and main.py import the wired instances from here."""

import logging
import os
from pathlib import Path

from sqlmodel import Session

from app.auth.service import AuthService
from app.core.config import settings
from app.core.db import engine
from app.emby.adapter import EmbyHttpApi, EmbyLibraryNotifier
from app.emby.service import EmbyPlaybackService
from app.emby.subtitles import SubtitleCache
from app.stream.adapter import FfmpegTranscoder
from app.stream.service import StreamService
from app.youtube.adapter import YtDlpVideoSource
from app.youtube.service import PlaylistService, VideoService
from app.youtube.worker import DownloadWorker, PlaylistSyncLoop


log = logging.getLogger(__name__)


def _session() -> Session:
    return Session(engine)


def _transcoder() -> FfmpegTranscoder:
    hdr_ffmpeg = settings.hdr_ffmpeg_path if os.access(settings.hdr_ffmpeg_path, os.X_OK) else None
    gpu = settings.gpu_render_device if hdr_ffmpeg and os.access(settings.gpu_render_device, os.R_OK | os.W_OK) else None
    if gpu and (kernel_cache := os.environ.get("NEO_CACHE_DIR")):
        Path(kernel_cache).mkdir(parents=True, exist_ok=True)  # see the Dockerfile
    log.info("HDR tone mapping: %s", "GPU" if gpu else "CPU" if hdr_ffmpeg else "off (no jellyfin-ffmpeg)")
    return FfmpegTranscoder(hdr_ffmpeg=hdr_ffmpeg, gpu_device=gpu)


emby_api = EmbyHttpApi(settings.emby_url)
auth_service = AuthService(settings.api_key, emby_verifier=emby_api)

video_source = YtDlpVideoSource(max_height=settings.download_max_height)

download_worker = DownloadWorker(
    source=video_source,
    library=EmbyLibraryNotifier(settings.emby_url, settings.emby_api_key),
    session_factory=_session,
    library_root=Path(settings.library_root),
    tmp_root=Path(settings.download_tmp),
)
playlist_service = PlaylistService(video_source, download_worker)
video_service = VideoService(download_worker)
playlist_sync_loop = PlaylistSyncLoop(playlist_service, _session, settings.playlist_sync_interval_seconds)

subtitle_cache = SubtitleCache(emby_api, Path(settings.database_path).parent / "subtitles")
emby_playback = EmbyPlaybackService(emby_api, settings.emby_api_key, subtitle_cache)
stream_service = StreamService(
    _transcoder(), max_concurrent=settings.max_concurrent_streams, resolvers={"emby": emby_playback}
)

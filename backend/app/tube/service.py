"""Browsing YouTube (cached) and playing it: the `youtube:<id>` stream resolver."""

import asyncio
import hashlib
import logging
import re
import time
from pathlib import Path

from app.stream.ports import (
    OutputFormat,
    ResolvedInput,
    SourceUnavailableError,
    StreamRequest,
    StreamSpec,
    Viewer,
    output_size,
)
from app.tube.cache import TtlCache
from app.tube.formats import pick_stream
from app.tube.ports import (
    ChannelPage,
    PlaylistPage,
    SearchKind,
    SearchResults,
    TubeSourcePort,
    TubeUnavailableError,
    TubeWebPort,
    VideoCard,
    VideoDetails,
)
from app.tube.urls import CHANNEL_ID, PLAYLIST_ID, VIDEO_ID, is_youtube_image

log = logging.getLogger(__name__)

SEARCH_TTL_S = 600
LIST_TTL_S = 1800
# Stream URLs say when they expire (~6 h); stop using them well before that.
URL_MARGIN_S = 1800
VIDEO_DEFAULT_TTL_S = 3600
SEARCH_LIMIT = 30
LIST_LIMIT = 60
IMAGE_CACHE_FILES = 4000


class InvalidIdError(Exception):
    pass


def _check(pattern, value: str, what: str) -> str:
    if not pattern.match(value):
        raise InvalidIdError(f"not a YouTube {what} id: {value!r}")
    return value


class TubeService:
    def __init__(self, source: TubeSourcePort, web: TubeWebPort, image_dir: Path) -> None:
        self._source = source
        self._web = web
        self._image_dir = image_dir
        self._searches: TtlCache[SearchResults] = TtlCache(200)
        self._videos: TtlCache[VideoDetails] = TtlCache(300)
        self._channels: TtlCache[ChannelPage] = TtlCache(200)
        self._playlists: TtlCache[PlaylistPage] = TtlCache(100)

    # --- browsing ---------------------------------------------------------------------

    async def search(self, query: str, kind: SearchKind) -> SearchResults:
        query = " ".join(query.split())[:200]
        if not query:
            return SearchResults()
        return await self._searches.get(
            f"{kind.value}:{query.lower()}", lambda: asyncio.to_thread(self._source.search, query, kind, SEARCH_LIMIT), SEARCH_TTL_S
        )

    async def video(self, video_id: str) -> VideoDetails:
        _check(VIDEO_ID, video_id, "video")

        def ttl(d: VideoDetails) -> float:
            return max(60.0, d.expires_at - time.time() - URL_MARGIN_S) if d.expires_at else VIDEO_DEFAULT_TTL_S

        return await self._videos.get(video_id, lambda: asyncio.to_thread(self._source.video, video_id), ttl)

    async def channel_feed(self, channel_id: str) -> list[VideoCard]:
        return await self._web.channel_feed(channel_id)

    def prefetch(self, video_id: str) -> None:
        """Start extracting a video now (a page about to offer Play), so Play is quick."""
        if VIDEO_ID.match(video_id) and self._videos.peek(video_id) is None:
            task = asyncio.create_task(self.video(video_id))
            task.add_done_callback(lambda t: t.cancelled() or t.exception())

    async def channel(self, channel_id: str) -> ChannelPage:
        _check(CHANNEL_ID, channel_id, "channel")
        return await self._channels.get(
            channel_id, lambda: asyncio.to_thread(self._source.channel, channel_id, LIST_LIMIT), LIST_TTL_S
        )

    async def playlist(self, playlist_id: str, fresh: bool = False) -> PlaylistPage:
        """fresh: skip the cache (a followed playlist the viewer just added to)."""
        _check(PLAYLIST_ID, playlist_id, "playlist")
        if fresh:
            self._playlists.drop(playlist_id)
        return await self._playlists.get(
            playlist_id, lambda: asyncio.to_thread(self._source.playlist, playlist_id, LIST_LIMIT), LIST_TTL_S
        )

    async def image(self, url: str) -> tuple[bytes, str]:
        """A YouTube thumbnail/avatar through our server (the car never contacts Google
        for it), cached on disk."""
        if not is_youtube_image(url):
            raise InvalidIdError("not a YouTube image URL")
        name = hashlib.sha256(url.encode()).hexdigest()
        cached = next(self._image_dir.glob(f"{name}.*"), None) if self._image_dir.exists() else None
        if cached:
            return cached.read_bytes(), "image/" + cached.suffix.removeprefix(".")
        data, content_type = await self._web.fetch_image(url)
        self._image_dir.mkdir(parents=True, exist_ok=True)
        suffix = re.sub(r"[^a-z0-9]", "", content_type.removeprefix("image/").lower())[:8] or "jpeg"
        (self._image_dir / f"{name}.{suffix}").write_bytes(data)
        return data, content_type

    def prune_images(self) -> None:
        """Keep the newest IMAGE_CACHE_FILES images."""
        if not self._image_dir.exists():
            return
        files = sorted(self._image_dir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
        for old in files[IMAGE_CACHE_FILES:]:
            old.unlink(missing_ok=True)

    # --- playing (SourceResolverPort for "youtube:<id>") --------------------------------

    async def resolve(self, source_id: str, request: StreamRequest, viewer: Viewer, output: OutputFormat) -> ResolvedInput:
        try:
            details = await self.video(source_id)
        except (InvalidIdError, TubeUnavailableError) as e:
            raise SourceUnavailableError(str(e)) from e
        live = details.card.is_live
        width, height, kbps = output_size(output, request)
        choice = pick_stream(details.formats, height, width, live)
        if choice and not await self._web.url_works(choice.video.url):
            # Expired or revoked early: extract again (once).
            log.info("stream URL for %s stopped working; extracting again", source_id)
            self._videos.drop(source_id)
            try:
                details = await self.video(source_id)
            except TubeUnavailableError as e:
                raise SourceUnavailableError(str(e)) from e
            choice = pick_stream(details.formats, height, width, live)
        if choice is None:
            raise SourceUnavailableError("YouTube offers no stream for this video")
        return ResolvedInput(StreamSpec(
            input_url=choice.video.url,
            audio_url=choice.audio.url if choice.audio else None,
            output=output,
            start_seconds=0 if live else request.start_seconds,  # live: always the live edge
            paced=request.paced,
            max_width=width,
            max_height=height,
            video_kbps=kbps,
            copy_video=choice.copy and output is OutputFormat.H264_TS,
        ))

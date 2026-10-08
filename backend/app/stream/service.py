import asyncio
import logging
from collections.abc import AsyncIterator, Mapping

from app.stream.ports import (
    OutputFormat,
    ResolvedInput,
    SourceResolverPort,
    StreamRequest,
    StreamSpec,
    TranscoderPort,
    UnknownSourceError,
    Viewer,
    output_size,
)

log = logging.getLogger(__name__)


class TooManyStreamsError(Exception):
    pass


class StreamService:
    """Resolves a StreamRequest into a StreamSpec via the resolver for its source kind,
    caps concurrent encodes, and cleans up resolver temp files when the stream ends.
    "test" (synthetic pattern) is built in; every other kind is a registered resolver."""

    def __init__(
        self, transcoder: TranscoderPort, max_concurrent: int, resolvers: Mapping[str, SourceResolverPort]
    ) -> None:
        self._transcoder = transcoder
        self._slots = asyncio.Semaphore(max_concurrent)
        self._resolvers = dict(resolvers)

    async def _resolve(self, request: StreamRequest, viewer: Viewer, output: OutputFormat) -> ResolvedInput:
        if request.source == "test":
            width, height, kbps = output_size(output, request)
            return ResolvedInput(
                StreamSpec(
                    input_url=None, output=output, start_seconds=request.start_seconds, max_duration_seconds=600, paced=request.paced,
                    max_width=width, max_height=height, video_kbps=kbps,
                )
            )
        kind, _, source_id = request.source.partition(":")
        resolver = self._resolvers.get(kind)
        if resolver is None or not source_id:
            raise UnknownSourceError(f"unknown source {request.source!r}")
        return await resolver.resolve(source_id, request, viewer, output)

    async def open(self, request: StreamRequest, viewer: Viewer, output: OutputFormat) -> AsyncIterator[bytes]:
        if self._slots.locked():
            raise TooManyStreamsError("all transcode slots are busy")
        async with self._slots:
            resolved = await self._resolve(request, viewer, output)
            try:
                async for chunk in self._transcoder.stream(resolved.spec):
                    yield chunk
            finally:
                for path in resolved.cleanup:
                    try:
                        path.unlink(missing_ok=True)
                    except OSError as e:
                        log.warning("could not remove stream temp file %s: %s", path, e)

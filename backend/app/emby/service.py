from pathlib import Path

from app.emby.ports import EmbyApiPort, EmbyItem, EmbyNotFoundError, EmbyStream, PlaybackEvent, PlaybackReport
from app.emby.subtitles import SubtitleCache, SubtitleStatus
from app.stream.ports import (
    ImageSubtitle,
    OutputFormat,
    ResolvedInput,
    SourceUnavailableError,
    StreamRequest,
    StreamSpec,
    TextSubtitle,
    Viewer,
    mpeg1_frame_rate,
    output_size,
)

def default_audio(streams: list[EmbyStream]) -> EmbyStream | None:
    audio = [s for s in streams if s.type == "Audio" and not s.is_external]
    return next((s for s in audio if s.is_default), audio[0] if audio else None)


class EmbyPlaybackService:
    """Everything the car player needs from Emby. Also the "emby" stream resolver
    (implements stream.ports.SourceResolverPort)."""

    # How long a stream start waits for a text subtitle before playing without it.
    SUBTITLE_WAIT_S = 2.0

    def __init__(self, api: EmbyApiPort, server_key: str, subtitles: SubtitleCache) -> None:
        self._api = api
        self._server_key = server_key
        self.subtitles = subtitles

    def _token(self, viewer: Viewer) -> str:
        token = viewer.emby_token or self._server_key
        if not token:
            raise SourceUnavailableError("no Emby credentials: sign in to Emby, or set EMBY_API_KEY")
        return token

    async def get_item(self, item_id: str, viewer: Viewer) -> EmbyItem:
        try:
            return await self._api.get_item(item_id, self._token(viewer), viewer.emby_user_id)
        except EmbyNotFoundError as e:
            raise SourceUnavailableError(str(e)) from e

    async def report(self, event: PlaybackEvent, report: PlaybackReport, viewer: Viewer) -> None:
        await self._api.report_playback(event, report, self._token(viewer))

    def subtitle_status(
        self, item_id: str, media_source_id: str, index: int, viewer: Viewer
    ) -> tuple[SubtitleStatus, str | None]:
        return self.subtitles.status(item_id, media_source_id, index, self._token(viewer))

    async def resolve(self, source_id: str, request: StreamRequest, viewer: Viewer, output: OutputFormat) -> ResolvedInput:
        token = self._token(viewer)
        item = await self.get_item(source_id, viewer)
        by_index = {s.index: s for s in item.streams}

        video = next((s for s in item.streams if s.type == "Video"), None)
        if video is None:
            raise SourceUnavailableError(f"item {source_id} has no video stream")

        if request.audio_index is not None:
            audio = by_index.get(request.audio_index)
            if audio is None or audio.type != "Audio" or audio.is_external:
                raise SourceUnavailableError(f"stream {request.audio_index} is not an audio track of this item")
        else:
            audio = default_audio(item.streams)

        subtitle: TextSubtitle | ImageSubtitle | None = None
        if request.subtitle_index is not None:
            sub = by_index.get(request.subtitle_index)
            if sub is None or sub.type != "Subtitle":
                raise SourceUnavailableError(f"stream {request.subtitle_index} is not a subtitle of this item")
            if sub.is_text or sub.is_external:
                # Cached, or extracted in the background; plays without it for now if it
                # isn't ready within SUBTITLE_WAIT_S (the player polls and reconnects).
                path = await self.subtitles.wait(source_id, item.media_source_id, sub.index, token, self.SUBTITLE_WAIT_S)
                subtitle = TextSubtitle(path) if path else None
            else:
                subtitle = ImageSubtitle(sub.index)

        url, headers = self._api.stream_input(source_id, item.media_source_id, token)
        remaining = (item.runtime_seconds or 4 * 3600) - request.start_seconds
        width, height, kbps = output_size(output, request)
        spec = StreamSpec(
            input_url=url,
            output=output,
            start_seconds=request.start_seconds,
            paced=request.paced,
            input_headers=headers,
            video_stream_index=video.index,
            audio_stream_index=audio.index if audio else None,
            subtitle=subtitle,
            max_duration_seconds=max(60, int(remaining) + 60),
            max_width=width,
            max_height=height,
            video_kbps=kbps,
            frame_rate=mpeg1_frame_rate(video.frame_rate),
            hdr=video.hdr,
        )
        return ResolvedInput(spec=spec)

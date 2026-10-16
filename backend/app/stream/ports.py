from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Protocol


class Quality(str, Enum):
    """What the car receives. Bitrate is what drives MPEG-1 picture quality (measured on
    a film clip at 720p: 1500k ≈ 34 dB PSNR, 4000k ≈ 40 dB); resolution mostly drives
    how hard the car's JS decoder works. The source's own bitrate never reaches the car."""

    LOW = "low"  # 流畅: weak signal
    MEDIUM = "medium"  # 标清
    HIGH = "high"  # 高清 (default)
    MAX = "max"  # 超清: may be too heavy for the car's decoder


# quality → (max output height, target video kbps), per codec. MPEG-1 is decoded in JS
# on the car's CPU, so resolution is capped by decode cost; H.264 is decoded by the
# car's hardware (WebCodecs, measured 1.4 ms/frame at 1080p) and compresses ~2× better,
# so it gets 1080p at a lower bitrate.
QUALITY_PRESETS: dict[Quality, tuple[int, int]] = {
    Quality.LOW: (480, 1000),
    Quality.MEDIUM: (720, 2000),
    Quality.HIGH: (720, 3500),
    Quality.MAX: (1080, 5000),
}
H264_QUALITY_PRESETS: dict[Quality, tuple[int, int]] = {
    Quality.LOW: (480, 800),
    Quality.MEDIUM: (720, 1500),
    Quality.HIGH: (1080, 3000),
    Quality.MAX: (1080, 6000),
}

# Frame rates MPEG-1 can carry (as ffmpeg rationals). Anything else must be snapped.
_MPEG1_RATES: list[tuple[float, str]] = [
    (24000 / 1001, "24000/1001"), (24.0, "24"), (25.0, "25"), (30000 / 1001, "30000/1001"), (30.0, "30"),
]


def mpeg1_frame_rate(source_fps: float | None) -> str:
    """Closest MPEG-1 rate at or under 30 fps for a source. Keeping film at 23.976
    instead of padding it to 30 saves the car ~20% of its decoding work and spends the
    bitrate on real frames; >30 fps sources are halved (50→25, 59.94→29.97)."""
    if not source_fps or source_fps <= 0:
        return "30"
    fps = source_fps / 2 if source_fps > 31 else source_fps
    return min(_MPEG1_RATES, key=lambda r: abs(r[0] - fps))[1]


class OutputFormat(str, Enum):
    # MPEG-1 video + MP2 audio in MPEG-TS: what JSMpeg decodes in JS onto a <canvas>.
    JSMPEG_TS = "jsmpeg_ts"
    # H.264 + AAC in MPEG-TS for the WebCodecs player: demuxed in the browser, video to
    # the hardware VideoDecoder, audio to AudioDecoder → WebAudio, drawn on a canvas.
    H264_TS = "h264ts"


def quality_preset(output: "OutputFormat", quality: Quality) -> tuple[int, int]:
    table = H264_QUALITY_PRESETS if output is OutputFormat.H264_TS else QUALITY_PRESETS
    return table[quality]


def output_size(output: "OutputFormat", request: "StreamRequest") -> tuple[int | None, int, int]:
    """(max width, max height, video kbps) for a request: the quality preset, shrunk to
    the viewer's display box when the player says how big it is. Pixels the screen
    can't show are never sent; the bitrate stays, so a capped stream just gets more
    bits per pixel."""
    height, kbps = quality_preset(output, request.quality)
    if request.max_height:
        height = min(height, request.max_height)
    return request.max_width, height, kbps


@dataclass(frozen=True)
class TextSubtitle:
    """A subtitle file on local disk (downloaded as .ass), burned in with libass."""

    path: Path


@dataclass(frozen=True)
class ImageSubtitle:
    """An image subtitle stream (PGS/DVD/DVB) inside the input, overlaid onto the video.
    stream_index is the absolute stream index in the input container."""

    stream_index: int


@dataclass(frozen=True)
class StreamSpec:
    # None = synthetic test pattern (moving counter + 440 Hz tone), no real input needed.
    input_url: str | None
    output: OutputFormat
    start_seconds: float = 0.0
    # True: read the input at native speed (the stream arrives in real time). False: as
    # fast as the client takes it; the client holds it back by flow control.
    paced: bool = True
    max_height: int = 720
    # Fit within max_width × max_height keeping the aspect ratio; None = height only.
    max_width: int | None = None
    video_kbps: int = 3500
    # ffmpeg rational (see mpeg1_frame_rate); None = 30.
    frame_rate: str | None = None
    # Hard cap so a forgotten tab can't transcode forever.
    max_duration_seconds: int = 4 * 3600
    # A separate audio input (YouTube serves picture and sound as two streams); None =
    # the sound is in input_url.
    audio_url: str | None = None
    # H.264_TS only: the input's video is already H.264 the car decodes, so pass it
    # through (no scaling, no subtitles, no tone mapping) and only re-encode the sound.
    copy_video: bool = False
    # Sent with the input request (e.g. the Emby token) instead of in the URL, so it
    # can't leak through ffmpeg error messages or process listings of the URL.
    input_headers: dict[str, str] = field(default_factory=dict)
    # Absolute input stream indexes; None = ffmpeg's default pick.
    video_stream_index: int | None = None
    audio_stream_index: int | None = None
    subtitle: TextSubtitle | ImageSubtitle | None = None
    # HDR10 / Dolby Vision / HLG source: needs tone mapping to SDR, or it plays washed
    # out (HDR10) or purple/green (Dolby Vision profile 5).
    hdr: bool = False


@dataclass(frozen=True)
class StreamRequest:
    """What a client asked to play. `source` is "<kind>:<id>" (e.g. "emby:12345") or
    "test"; the kind picks the resolver."""

    source: str
    start_seconds: float = 0.0
    audio_index: int | None = None
    subtitle_index: int | None = None
    quality: Quality = Quality.HIGH
    # The player's display box in device pixels, if it said: output never exceeds it.
    max_width: int | None = None
    max_height: int | None = None
    # The client does flow control (see stream.routes): no real-time pacing.
    paced: bool = True


@dataclass(frozen=True)
class Viewer:
    """Whose credentials a resolver should use. emby_token None = the server's own key
    (a BackseatFin device session rather than an Emby login); emby_user_id enables
    per-user data such as the resume position."""

    emby_token: str | None = None
    emby_user_id: str | None = None


@dataclass
class ResolvedInput:
    spec: StreamSpec
    # Temp files (e.g. downloaded subtitles) to delete once the stream ends.
    cleanup: list[Path] = field(default_factory=list)


class UnknownSourceError(Exception):
    pass


class SourceUnavailableError(Exception):
    """The source exists as a kind but this item can't be streamed (missing, no access)."""


class SourceResolverPort(Protocol):
    async def resolve(self, source_id: str, request: StreamRequest, viewer: Viewer, output: OutputFormat) -> ResolvedInput:
        ...


class TranscoderPort(Protocol):
    def stream(self, spec: StreamSpec) -> AsyncIterator[bytes]:
        """Yields encoded bytes paced at playback speed; closing the iterator (or the
        consumer going away) must stop the underlying process."""
        ...

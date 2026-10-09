"""ffmpeg subprocess implementation of TranscoderPort — the only module that runs ffmpeg."""

import asyncio
import contextlib
import logging
import re
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass

from app.stream.ports import ImageSubtitle, OutputFormat, StreamSpec, TextSubtitle

log = logging.getLogger(__name__)

CHUNK_BYTES = 64 * 1024


_SAFE_PATH = re.compile(r"^[A-Za-z0-9_./-]+$")


@dataclass(frozen=True)
class ToneMapping:
    """How to bring an HDR source down to SDR. Only jellyfin-ffmpeg can: its tone mappers
    also apply Dolby Vision's reshaping metadata, without which profile 5 (no HDR10 base
    layer) plays purple/green. gpu_device set = decode, scale and tone-map on the iGPU
    (VAAPI + OpenCL); None = on the CPU (tonemapx), capped at CPU_TONE_MAP_MAX_HEIGHT.
    Measured on the N305 with 4K sources → H.264: GPU 720p 3.2×, 1080p 1.9× real time;
    CPU 720p 1.6×, 1080p 0.9× (too slow)."""

    ffmpeg: str
    gpu_device: str | None = None


CPU_TONE_MAP_MAX_HEIGHT = 720
# bt2390 with desat=0 is Jellyfin's default curve; peak=100 targets an SDR display.
_TONE_MAP_OPTS = "tonemap=bt2390:desat=0:peak=100:t=bt709:m=bt709:p=bt709"
_GPU_TO_SDR = f"hwmap=derive_device=opencl:mode=read,tonemap_opencl=format=nv12:{_TONE_MAP_OPTS},hwdownload,format=nv12,format=yuv420p"
_CPU_TO_SDR = f"tonemapx={_TONE_MAP_OPTS}:format=yuv420p"


def _scale(height: int, width: int | None = None) -> str:
    if width is None:
        return f"scale=-2:'min({height},ih)'"
    # Fit the box, keep the aspect ratio, never upscale (a 2.39:1 film in a 16:10
    # window is limited by the width, not the height).
    return f"scale=w='min({width},iw)':h='min({height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2"


def _text_subtitle(spec: StreamSpec, sub: TextSubtitle) -> str:
    # The .ass file is timed from 0 while the seeked video starts at 0 too; shift the
    # frames forward to real time for libass, then back so output starts at 0.
    if not _SAFE_PATH.match(str(sub.path)):
        raise ValueError(f"unsafe subtitle path {sub.path}")
    t = f"{spec.start_seconds:.3f}"
    return f"setpts=PTS+{t}/TB,subtitles=filename={sub.path},setpts=PTS-STARTPTS"


def _video_chain(spec: StreamSpec, video_in: str, tone_map: ToneMapping | None = None) -> str:
    sub = spec.subtitle
    # Input seeking (-ss before -i) shifts an image subtitle stream together with the
    # video, so an overlay lines up without any timestamp adjustment. It's drawn at the
    # source's resolution (the subtitle canvas matches it), then scaled with the video.
    image = f"[0:{sub.stream_index}]" if isinstance(sub, ImageSubtitle) else None
    text = _text_subtitle(spec, sub) if isinstance(sub, TextSubtitle) else None

    if tone_map is None:
        if image:
            return f"{video_in}{image}overlay,{_scale(spec.max_height, spec.max_width)}"
        return f"{video_in}{','.join(filter(None, [text, _scale(spec.max_height, spec.max_width)]))}"

    # HDR: subtitles go on after tone mapping, so their colours aren't tone-mapped too.
    if tone_map.gpu_device:
        if image:
            return f"{video_in}{_GPU_TO_SDR}[sdr];[sdr]{image}overlay,{_scale(spec.max_height, spec.max_width)}"
        box = _scale(spec.max_height, spec.max_width).removeprefix("scale=")
        if spec.max_width is None:
            box = f"w=-2:h='min({spec.max_height},ih)'"
        gpu_scale = f"scale_vaapi={box}:format=p010"
        return f"{video_in}{','.join(filter(None, [gpu_scale, _GPU_TO_SDR, text]))}"
    height = min(spec.max_height, CPU_TONE_MAP_MAX_HEIGHT)
    if image:
        # 10-bit overlay keeps the HDR signal (and Dolby Vision metadata) for tonemapx.
        return f"{video_in}{image}overlay=format=yuv420p10,{_scale(height, spec.max_width)},{_CPU_TO_SDR}"
    return f"{video_in}{','.join(filter(None, [_scale(height, spec.max_width), _CPU_TO_SDR, text]))}"


def _video_graph(spec: StreamSpec, video_in: str, tone_map: ToneMapping | None = None) -> str:
    # Square pixels: scaling to fit can leave a sample aspect ratio like 641:640, and the
    # browser then has to resample every frame to draw it (measured ~30x the draw cost).
    return f"{_video_chain(spec, video_in, tone_map)},setsar=1[v]"


def build_ffmpeg_args(spec: StreamSpec, fast_probe: bool = True, tone_map: ToneMapping | None = None) -> list[str]:
    """fast_probe: skip most of ffmpeg's input analysis (default ~5 s / 5 MB of reading).
    Streams are mapped by index from what Emby already knows, so the long probe only
    cost start-up time — measured 2.9 s → 1.0 s to first byte on an HEVC mkv.
    tone_map: convert an HDR source to SDR this way (None = pass colours through)."""
    args = [tone_map.ffmpeg if tone_map else "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin"]
    if tone_map and tone_map.gpu_device and spec.input_url is not None:
        args += [
            "-init_hw_device", f"vaapi=va:{tone_map.gpu_device}", "-init_hw_device", "opencl=ocl@va",
            "-filter_hw_device", "ocl", "-hwaccel", "vaapi", "-hwaccel_output_format", "vaapi",
        ]
    if spec.input_url is None:
        args += [
            "-re", "-f", "lavfi", "-i", f"testsrc=size=1920x1080:rate=30:duration={spec.max_duration_seconds}",
            "-re", "-f", "lavfi", "-i", f"sine=frequency=440:sample_rate=44100:duration={spec.max_duration_seconds}",
        ]
        video_in, audio_map = "[0:v:0]", "1:a:0"
    else:
        if spec.input_headers:
            args += ["-headers", "".join(f"{k}: {v}\r\n" for k, v in spec.input_headers.items())]
        if fast_probe:
            args += ["-probesize", "1M", "-analyzeduration", "1000000"]
        if spec.start_seconds > 0:
            args += ["-ss", f"{spec.start_seconds:.3f}"]
        # -re paces reading at native speed: JSMpeg plays frames as they arrive with no
        # client-side buffering, so an unpaced encode would just flood the socket. A
        # WebCodecs player that buffers but doesn't do flow control gets the first 2 s as
        # a burst. One that does flow control (spec.paced False) gets the stream as fast
        # as ffmpeg makes it until it says "hold": while we don't read ffmpeg's output,
        # the pipe fills and ffmpeg waits.
        if spec.paced:
            if spec.output is OutputFormat.H264_TS:
                args += ["-readrate_initial_burst", "2"]
            args += ["-re"]
        args += ["-i", spec.input_url, "-t", str(spec.max_duration_seconds)]
        video_in = f"[0:{spec.video_stream_index}]" if spec.video_stream_index is not None else "[0:v:0]"
        # Trailing "?" = optional: a file without audio still streams.
        audio_map = f"0:{spec.audio_stream_index}" if spec.audio_stream_index is not None else "0:a:0?"

    args += ["-filter_complex", _video_graph(spec, video_in, tone_map), "-map", "[v]"]
    if spec.output is not OutputFormat.H264_ANNEXB:
        args += ["-map", audio_map]
    if spec.output is OutputFormat.H264_ANNEXB:
        # Main profile, no B-frames (decode order = display order, so the client can
        # timestamp frames by count), an AUD before every frame (the client splits the
        # byte stream on it), and a keyframe every 2 s so a decoder can join quickly.
        args += [
            "-r", spec.frame_rate or "30",
            # 4:2:0 8-bit explicitly: RGB (the test pattern) or 10-bit (HEVC films)
            # input would otherwise make x264 pick a format browsers can't decode.
            "-pix_fmt", "yuv420p",
            "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-profile:v", "main",
            "-bf", "0", "-g", "60", "-x264-params", "aud=1",
            "-b:v", f"{spec.video_kbps}k", "-maxrate", f"{spec.video_kbps * 2}k", "-bufsize", f"{spec.video_kbps * 2}k",
            "-an", "-f", "h264", "pipe:1",
        ]
    elif spec.output is OutputFormat.H264_TS:
        # High profile (hardware decoders all take it), 4:2:0 8-bit, no B-frames (decode
        # order = presentation order keeps the client simple), keyframe every ~2 s so a
        # seek/reconnect shows a picture fast. AAC-LC stereo 48 kHz for AudioDecoder.
        args += [
            "-r", spec.frame_rate or "30",
            "-pix_fmt", "yuv420p",
            # zerolatency: no lookahead/frame-thread delay, ~0.3 s faster to first byte at
            # a small efficiency cost — responsiveness beats quality in the car.
            "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-profile:v", "high", "-bf", "0", "-g", "48",
            "-b:v", f"{spec.video_kbps}k", "-maxrate", f"{spec.video_kbps * 2}k", "-bufsize", f"{spec.video_kbps * 2}k",
            "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
            "-f", "mpegts", "-muxdelay", "0", "pipe:1",
        ]
    elif spec.output is OutputFormat.JSMPEG_TS:
        args += [
            "-r", spec.frame_rate or "30",
            "-c:v", "mpeg1video", "-b:v", f"{spec.video_kbps}k", "-maxrate", f"{spec.video_kbps * 2}k",
            "-bufsize", f"{spec.video_kbps * 2}k", "-bf", "0",
            "-c:a", "mp2", "-b:a", "128k", "-ar", "44100", "-ac", "2",
            "-f", "mpegts", "-muxdelay", "0.001", "pipe:1",
        ]
    else:
        args += [
            "-pix_fmt", "yuv420p",  # see the H.264 branch: browsers can't decode 4:4:4
            # frag_keyframe emits a fragment per keyframe; x264's default GOP (250 frames
            # ≈ 8 s) meant nothing reached the <video> element for 8 s and it "stalled".
            "-g", "30",
            "-c:v", "libx264", "-preset", "veryfast", "-b:v", f"{spec.video_kbps}k",
            "-c:a", "aac", "-b:a", "128k", "-ac", "2",
            "-f", "mp4", "-movflags", "frag_keyframe+empty_moov+default_base_moof", "pipe:1",
        ]
    return args


class FfmpegTranscoder:
    # After the GPU path fails, HDR streams use the CPU for this long before trying again.
    GPU_COOLDOWN_S = 600

    def __init__(self, hdr_ffmpeg: str | None = None, gpu_device: str | None = None) -> None:
        """hdr_ffmpeg: jellyfin-ffmpeg, for tone mapping HDR sources (None = HDR plays
        with its colours untouched). gpu_device: a VAAPI render node for it (None = CPU)."""
        self._hdr_ffmpeg = hdr_ffmpeg
        self._gpu_device = gpu_device
        self._gpu_off_until = 0.0

    def _attempts(self, spec: StreamSpec) -> list[tuple[ToneMapping | None, bool]]:
        """(tone mapping, fast probe) to try in order until one produces output. A file
        whose streams the short probe can't identify fails before any output, so the
        last attempt always uses ffmpeg's full analysis."""
        if spec.input_url is None:
            return [(None, True)]
        if not (spec.hdr and self._hdr_ffmpeg):
            return [(None, True), (None, False)]
        cpu = ToneMapping(self._hdr_ffmpeg)
        attempts: list[tuple[ToneMapping | None, bool]] = []
        if self._gpu_device and time.monotonic() >= self._gpu_off_until:
            attempts.append((ToneMapping(self._hdr_ffmpeg, self._gpu_device), True))
        return [*attempts, (cpu, True), (cpu, False)]

    async def stream(self, spec: StreamSpec) -> AsyncIterator[bytes]:
        for tone_map, fast_probe in self._attempts(spec):
            produced = False
            async for chunk in self._run(spec, fast_probe, tone_map):
                produced = True
                yield chunk
            if produced or spec.input_url is None:
                return
            if tone_map and tone_map.gpu_device:
                log.warning("GPU tone mapping produced nothing; using the CPU for %d s", self.GPU_COOLDOWN_S)
                self._gpu_off_until = time.monotonic() + self.GPU_COOLDOWN_S
            else:
                log.warning("ffmpeg produced nothing (fast probe %s); trying the next way", fast_probe)

    async def _run(self, spec: StreamSpec, fast_probe: bool, tone_map: ToneMapping | None) -> AsyncIterator[bytes]:
        proc = await asyncio.create_subprocess_exec(
            *build_ffmpeg_args(spec, fast_probe, tone_map),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        assert proc.stdout is not None and proc.stderr is not None
        try:
            while chunk := await proc.stdout.read(CHUNK_BYTES):
                yield chunk
        finally:
            if proc.returncode is None:
                proc.kill()
            with contextlib.suppress(ProcessLookupError):
                await proc.wait()
            err = (await proc.stderr.read()).decode(errors="replace").strip()
            if err and proc.returncode not in (0, -9):
                log.warning("ffmpeg exited %s: %s", proc.returncode, err[-2000:])

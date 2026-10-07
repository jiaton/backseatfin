import app.stream.adapter as adapter
from app.stream.ports import OutputFormat, StreamSpec

HDR = StreamSpec(input_url="http://emby/x", output=OutputFormat.H264_TS, hdr=True)


def _fake_run(calls: list, succeed_when):
    async def fake_run(self, spec, fast_probe, tone_map):
        way = "sdr" if tone_map is None else "gpu" if tone_map.gpu_device else "cpu"
        calls.append((way, fast_probe))
        if succeed_when(way, fast_probe):
            yield b"data"

    return fake_run


async def test_retries_once_with_full_probe_when_fast_probe_yields_nothing(monkeypatch):
    calls: list = []
    monkeypatch.setattr(adapter.FfmpegTranscoder, "_run", _fake_run(calls, lambda way, fast: not fast))
    spec = StreamSpec(input_url="http://emby/x", output=OutputFormat.H264_TS)
    out = [c async for c in adapter.FfmpegTranscoder().stream(spec)]
    assert out == [b"data"] and calls == [("sdr", True), ("sdr", False)]


async def test_no_retry_when_output_started(monkeypatch):
    calls: list = []
    monkeypatch.setattr(adapter.FfmpegTranscoder, "_run", _fake_run(calls, lambda way, fast: True))
    out = [c async for c in adapter.FfmpegTranscoder().stream(StreamSpec(input_url="http://x", output=OutputFormat.H264_TS))]
    assert out == [b"data"] and calls == [("sdr", True)]


async def test_hdr_uses_the_gpu_when_there_is_one(monkeypatch):
    calls: list = []
    monkeypatch.setattr(adapter.FfmpegTranscoder, "_run", _fake_run(calls, lambda way, fast: True))
    t = adapter.FfmpegTranscoder(hdr_ffmpeg="/jf/ffmpeg", gpu_device="/dev/dri/renderD128")
    assert [c async for c in t.stream(HDR)] == [b"data"] and calls == [("gpu", True)]


async def test_hdr_falls_back_to_cpu_and_skips_the_gpu_for_a_while(monkeypatch):
    calls: list = []
    monkeypatch.setattr(adapter.FfmpegTranscoder, "_run", _fake_run(calls, lambda way, fast: way == "cpu"))
    t = adapter.FfmpegTranscoder(hdr_ffmpeg="/jf/ffmpeg", gpu_device="/dev/dri/renderD128")
    assert [c async for c in t.stream(HDR)] == [b"data"]
    assert [c async for c in t.stream(HDR)] == [b"data"]
    assert calls == [("gpu", True), ("cpu", True), ("cpu", True)]  # second stream: GPU cooling down


async def test_hdr_without_jellyfin_ffmpeg_plays_untouched_and_sdr_never_tone_maps(monkeypatch):
    calls: list = []
    monkeypatch.setattr(adapter.FfmpegTranscoder, "_run", _fake_run(calls, lambda way, fast: True))
    [c async for c in adapter.FfmpegTranscoder().stream(HDR)]
    t = adapter.FfmpegTranscoder(hdr_ffmpeg="/jf/ffmpeg", gpu_device="/dev/dri/renderD128")
    [c async for c in t.stream(StreamSpec(input_url="http://x", output=OutputFormat.H264_TS))]
    assert calls == [("sdr", True), ("sdr", True)]

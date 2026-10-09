from pathlib import Path

import pytest

from app.emby.ports import EmbyItem, EmbyNotFoundError, EmbyStream
from app.emby.service import EmbyPlaybackService
from app.emby.subtitles import SubtitleCache
from app.stream.ports import (
    ImageSubtitle,
    OutputFormat,
    SourceUnavailableError,
    StreamRequest,
    StreamSpec,
    TextSubtitle,
    Viewer,
)
from app.stream.service import StreamService


def _s(index, type_, default=False, text=False, external=False, fps=None):
    return EmbyStream(index, type_, "x", f"#{index}", None, default, external, text, fps)


ITEM = EmbyItem(
    id="5", name="Movie", series_name=None, season_number=None, episode_number=None,
    runtime_seconds=8000.0, resume_seconds=0, media_source_id="ms1",
    streams=[
        _s(0, "Video", fps=23.976),
        _s(1, "Audio"),
        _s(2, "Audio", default=True),
        _s(3, "Subtitle"),  # PGS
        _s(4, "Subtitle", text=True),  # SRT embedded
        _s(9, "Subtitle", external=True, text=True),
    ],
)


class FakeApi:
    def __init__(self) -> None:
        self.tokens: list[str] = []
        self.downloads: list[int] = []

    async def verify_user_token(self, token, user_id):
        return token == "good"

    async def get_item(self, item_id, token, user_id):
        self.tokens.append(token)
        if item_id != "5":
            raise EmbyNotFoundError("nope")
        return ITEM

    def stream_input(self, item_id, media_source_id, token):
        return f"http://emby/Videos/{item_id}/stream?MediaSourceId={media_source_id}", {"X-Emby-Token": token}

    async def download_subtitle(self, item_id, media_source_id, index, token, dest: Path, timeout=60):
        self.downloads.append(index)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text("[Script Info]")

    async def report_playback(self, event, report, token):
        pass


def _svc(tmp_path, server_key="server-key"):
    api = FakeApi()
    return EmbyPlaybackService(api, server_key, SubtitleCache(api, tmp_path / "subs")), api


async def test_default_audio_and_viewer_token(tmp_path):
    svc, api = _svc(tmp_path)
    r = await svc.resolve("5", StreamRequest("emby:5", 60), Viewer("user-token", "u1"), OutputFormat.JSMPEG_TS)
    assert r.spec.audio_stream_index == 2 and r.spec.video_stream_index == 0
    assert r.spec.input_headers == {"X-Emby-Token": "user-token"} and "user-token" not in r.spec.input_url
    assert r.spec.subtitle is None and r.cleanup == []
    assert r.spec.max_duration_seconds == 8000 - 60 + 60
    assert api.tokens == ["user-token"]


async def test_quality_preset_and_native_frame_rate_reach_the_spec(tmp_path):
    from app.stream.ports import Quality

    svc, _ = _svc(tmp_path)
    r = await svc.resolve("5", StreamRequest("emby:5"), Viewer("t"), OutputFormat.JSMPEG_TS)
    assert (r.spec.max_height, r.spec.video_kbps, r.spec.frame_rate) == (720, 3500, "24000/1001")
    r = await svc.resolve("5", StreamRequest("emby:5", quality=Quality.LOW), Viewer("t"), OutputFormat.JSMPEG_TS)
    assert (r.spec.max_height, r.spec.video_kbps) == (480, 1000)


async def test_hdr_flag_reaches_the_spec(tmp_path, monkeypatch):
    import dataclasses

    import app.emby.adapter as emby_adapter

    svc, _ = _svc(tmp_path)
    assert (await svc.resolve("5", StreamRequest("emby:5"), Viewer("t"), OutputFormat.H264_TS)).spec.hdr is False
    hdr_video = dataclasses.replace(ITEM.streams[0], hdr=True)
    hdr_item = dataclasses.replace(ITEM, streams=[hdr_video, *ITEM.streams[1:]])

    async def get_item(*_):
        return hdr_item

    monkeypatch.setattr(svc._api, "get_item", get_item)
    assert (await svc.resolve("5", StreamRequest("emby:5"), Viewer("t"), OutputFormat.H264_TS)).spec.hdr is True

    # Emby's VideoRange: anything but SDR is tone-mapped; only video streams count.
    to_stream = emby_adapter._to_stream
    assert to_stream({"Index": 0, "Type": "Video", "VideoRange": "DolbyVision"}).hdr
    assert to_stream({"Index": 0, "Type": "Video", "VideoRange": "HDR 10"}).hdr
    assert not to_stream({"Index": 0, "Type": "Video", "VideoRange": "SDR"}).hdr
    assert not to_stream({"Index": 0, "Type": "Video"}).hdr
    assert not to_stream({"Index": 1, "Type": "Audio", "VideoRange": "HDR 10"}).hdr


async def test_viewer_box_reaches_the_spec(tmp_path):
    from app.stream.ports import Quality

    svc, _ = _svc(tmp_path)
    req = StreamRequest("emby:5", quality=Quality.HIGH, max_width=1780, max_height=1000)
    r = await svc.resolve("5", req, Viewer("t"), OutputFormat.H264_TS)
    assert (r.spec.max_width, r.spec.max_height, r.spec.video_kbps) == (1780, 1000, 3000)


async def test_device_viewer_falls_back_to_server_key_and_errors_without_one(tmp_path):
    svc, api = _svc(tmp_path)
    await svc.resolve("5", StreamRequest("emby:5"), Viewer(), OutputFormat.JSMPEG_TS)
    assert api.tokens == ["server-key"]
    bare, _ = _svc(tmp_path, server_key="")
    with pytest.raises(SourceUnavailableError):
        await bare.resolve("5", StreamRequest("emby:5"), Viewer(), OutputFormat.JSMPEG_TS)


async def test_track_choices_are_validated(tmp_path):
    svc, _ = _svc(tmp_path)
    r = await svc.resolve("5", StreamRequest("emby:5", audio_index=1), Viewer("t"), OutputFormat.JSMPEG_TS)
    assert r.spec.audio_stream_index == 1
    for bad in (StreamRequest("emby:5", audio_index=3), StreamRequest("emby:5", subtitle_index=1),
                StreamRequest("emby:5", subtitle_index=42)):
        with pytest.raises(SourceUnavailableError):
            await svc.resolve("5", bad, Viewer("t"), OutputFormat.JSMPEG_TS)
    with pytest.raises(SourceUnavailableError):
        await svc.resolve("404", StreamRequest("emby:404"), Viewer("t"), OutputFormat.JSMPEG_TS)


async def test_image_subtitle_overlays_and_text_subtitles_download_to_temp(tmp_path):
    svc, api = _svc(tmp_path)
    r = await svc.resolve("5", StreamRequest("emby:5", subtitle_index=3), Viewer("t"), OutputFormat.JSMPEG_TS)
    assert r.spec.subtitle == ImageSubtitle(3) and api.downloads == []
    for idx in (4, 9):  # embedded text and external both go through Emby's .ass conversion
        r = await svc.resolve("5", StreamRequest("emby:5", subtitle_index=idx), Viewer("t"), OutputFormat.JSMPEG_TS)
        assert isinstance(r.spec.subtitle, TextSubtitle) and r.spec.subtitle.path.exists()
        assert r.cleanup == []  # cached for next time, not a temp file
    await svc.resolve("5", StreamRequest("emby:5", subtitle_index=4), Viewer("t"), OutputFormat.JSMPEG_TS)
    assert api.downloads == [4, 9]  # second play of 4 came from the cache


async def test_stream_service_removes_resolver_temp_files_when_the_stream_ends(tmp_path):
    from app.stream.ports import ResolvedInput

    temp = tmp_path / "scratch.bin"
    temp.write_text("x")

    class Resolver:
        async def resolve(self, source_id, request, viewer, output):
            return ResolvedInput(StreamSpec(input_url="http://x", output=output), cleanup=[temp])

    class FakeTranscoder:
        async def stream(self, spec):
            yield b"ts"

    streams = StreamService(FakeTranscoder(), 1, {"emby": Resolver()})
    chunks = [c async for c in streams.open(StreamRequest("emby:5"), Viewer("t"), OutputFormat.JSMPEG_TS)]
    assert chunks == [b"ts"] and not temp.exists()

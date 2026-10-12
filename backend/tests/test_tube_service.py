import asyncio
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.stream.ports import OutputFormat, Quality, SourceUnavailableError, StreamRequest, Viewer
from app.tube.ports import ChannelCard, ChannelPage, MediaFormat, TubeUnavailableError, VideoCard, VideoDetails
from app.tube.service import InvalidIdError, TubeService

VID = "aqz-KE-bpKQ"


def _details(live=False, tag="1") -> VideoDetails:
    return VideoDetails(
        card=VideoCard(VID, "Big Buck Bunny", "UCSMOQeBJ2RAnuFungnQOxLg", "Blender", 635, is_live=live),
        formats=[
            MediaFormat("298", f"https://v.example.com/298?{tag}", "avc1.4d401f", None, 720, 1280),
            MediaFormat("299", f"https://v.example.com/299?{tag}", "avc1.640028", None, 1080, 1920),
            MediaFormat("140", f"https://v.example.com/140?{tag}", None, "mp4a.40.2", kbps=129),
        ],
        expires_at=None,
    )


class FakeSource:
    def __init__(self):
        self.video_calls = 0
        self.live = False

    def video(self, video_id):
        self.video_calls += 1
        return _details(self.live, tag=str(self.video_calls))

    def channel(self, channel_id, limit):
        return ChannelPage(ChannelCard("UCSMOQeBJ2RAnuFungnQOxLg", "Blender"), None, "", [VideoCard(VID, "BBB", duration_seconds=635)])

    def search(self, query, kind, limit):
        raise TubeUnavailableError("offline")

    def playlist(self, playlist_id, limit):
        raise TubeUnavailableError("offline")


class FakeWeb:
    def __init__(self):
        self.dead: set[str] = set()
        self.images = 0

    async def url_works(self, url):
        return url not in self.dead

    async def fetch_image(self, url):
        self.images += 1
        return b"jpeg-bytes", "image/jpeg"

    async def channel_feed(self, channel_id):
        return [VideoCard(VID, "BBB", channel_id, "Blender", published_at=datetime(2026, 10, 1, tzinfo=timezone.utc))]


def _svc(tmp_path: Path):
    src, web = FakeSource(), FakeWeb()
    return TubeService(src, web, tmp_path / "images"), src, web


def _request(**kw):
    return StreamRequest(source=f"youtube:{VID}", quality=Quality.MEDIUM, paced=False, **kw)


def test_resolve_passes_h264_through_at_the_level_with_aac(tmp_path):
    svc, src, _ = _svc(tmp_path)
    spec = asyncio.run(svc.resolve(VID, _request(start_seconds=42), Viewer(), OutputFormat.H264_TS)).spec
    assert spec.input_url.startswith("https://v.example.com/298") and spec.audio_url.startswith("https://v.example.com/140")
    assert spec.copy_video and spec.start_seconds == 42 and not spec.paced
    # JSMpeg can't take H.264: same inputs, transcoded.
    assert not asyncio.run(svc.resolve(VID, _request(), Viewer(), OutputFormat.JSMPEG_TS)).spec.copy_video
    assert src.video_calls == 1  # cached


def test_a_dead_stream_url_is_extracted_again(tmp_path):
    svc, src, web = _svc(tmp_path)

    async def main():
        await svc.video(VID)
        web.dead.add("https://v.example.com/298?1")
        return (await svc.resolve(VID, _request(), Viewer(), OutputFormat.H264_TS)).spec

    assert asyncio.run(main()).input_url == "https://v.example.com/298?2" and src.video_calls == 2


def test_live_streams_and_bad_ids_are_refused(tmp_path):
    svc, src, _ = _svc(tmp_path)
    src.live = True
    with pytest.raises(SourceUnavailableError):
        asyncio.run(svc.resolve(VID, _request(), Viewer(), OutputFormat.H264_TS))
    with pytest.raises(SourceUnavailableError):
        asyncio.run(svc.resolve("../../etc", _request(), Viewer(), OutputFormat.H264_TS))


def test_images_come_only_from_youtube_and_are_cached_on_disk(tmp_path):
    svc, _, web = _svc(tmp_path)
    url = f"https://i.ytimg.com/vi/{VID}/hqdefault.jpg"
    assert asyncio.run(svc.image(url)) == (b"jpeg-bytes", "image/jpeg")
    assert asyncio.run(svc.image(url)) == (b"jpeg-bytes", "image/jpeg")
    assert web.images == 1
    with pytest.raises(InvalidIdError):
        asyncio.run(svc.image("http://192.168.1.1/admin"))

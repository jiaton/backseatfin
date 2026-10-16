import asyncio
import json

import pytest

from app.tube.captions import parse_json3, pick_tracks
from app.tube.ports import CaptionTrack, Cue
from app.tube.service import InvalidIdError, TubeService
from app.tube.urls import is_youtube_caption
from tests.test_tube_service import VID, FakeSource, FakeWeb, _details


def _fmts(name):
    return [{"ext": "vtt", "url": "https://www.youtube.com/api/timedtext?fmt=vtt", "name": name},
            {"ext": "json3", "url": f"https://www.youtube.com/api/timedtext?fmt=json3&n={name}", "name": name}]


def test_offers_the_uploaders_tracks_in_order_then_the_original_automatic_one():
    subs = {"zh-CN": _fmts("Chinese (China)"), "fr": _fmts("French"), "en": _fmts("English"), "live_chat": _fmts("chat")}
    auto = {"en-orig": _fmts("English (Original)"), "en": _fmts("English"), "zh-Hans": _fmts("Chinese (Simplified)")}
    tracks = pick_tracks(subs, auto, "en")
    # the video's language first; French isn't one of the app's; no automatic duplicate of English
    assert [(t.id, t.auto) for t in tracks] == [("sub:en", False), ("sub:zh-CN", False)]
    # nothing uploaded: the original automatic captions, never their machine translations
    tracks = pick_tracks({}, auto, "en")
    assert [(t.id, t.lang, t.auto) for t in tracks] == [("auto:en-orig", "en", True)]


def test_json3_becomes_cues_skipping_empty_events():
    doc = {"events": [
        {"tStartMs": 0, "dDurationMs": 5000},  # a window event, no text
        {"tStartMs": 1200, "dDurationMs": 2500, "segs": [{"utf8": "Good "}, {"utf8": "morning"}]},
        {"tStartMs": 4000, "dDurationMs": 100, "segs": [{"utf8": "\n"}]},
        {"tStartMs": 5000, "segs": [{"utf8": "How are you?"}]},
    ]}
    assert parse_json3(json.dumps(doc)) == [Cue(1.2, 3.7, "Good morning"), Cue(5.0, 5.0, "How are you?")]


@pytest.mark.parametrize("url, ok", [
    ("https://www.youtube.com/api/timedtext?v=x&fmt=json3", True),
    ("https://www.youtube.com/watch?v=x", False),
    ("https://evil.example.com/api/timedtext", False),
    ("http://www.youtube.com/api/timedtext", False),
])
def test_captions_are_fetched_only_from_youtubes_timedtext(url, ok):
    assert is_youtube_caption(url) is ok


def test_service_serves_a_tracks_cues_and_refuses_unknown_tracks(tmp_path):
    class Src(FakeSource):
        def video(self, video_id):
            d = _details()
            return type(d)(card=d.card, formats=d.formats, captions=[
                CaptionTrack("sub:en", "en", "English", False, "https://www.youtube.com/api/timedtext?fmt=json3"),
            ])

    class Web(FakeWeb):
        fetched = 0

        async def fetch_text(self, url):
            self.fetched += 1
            return json.dumps({"events": [{"tStartMs": 1000, "dDurationMs": 1000, "segs": [{"utf8": "Hi"}]}]})

    web = Web()
    svc = TubeService(Src(), web, tmp_path)
    assert asyncio.run(svc.captions(VID, "sub:en")) == [Cue(1.0, 2.0, "Hi")]
    asyncio.run(svc.captions(VID, "sub:en"))
    assert web.fetched == 1  # cached
    with pytest.raises(InvalidIdError):
        asyncio.run(svc.captions(VID, "sub:xx"))

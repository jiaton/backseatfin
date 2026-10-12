import asyncio

import pytest

from app.tube import library as library_module
from app.tube.library import TubeLibrary
from app.tube.ports import TubeUnavailableError
from app.tube.ports import VideoCard
from app.tube.service import TubeService
from tests.test_tube_service import VID, FakeSource, FakeWeb


@pytest.fixture(autouse=True)
def _no_retry_wait(monkeypatch):
    monkeypatch.setattr(library_module, "RSS_RETRY_DELAYS_S", (0, 0, 0))


def _lib(tmp_path, web=None):
    return TubeLibrary(TubeService(FakeSource(), web or FakeWeb(), tmp_path))


def test_follow_fills_the_feed_with_dates_and_durations_and_unfollow_clears_it(tmp_path, session_factory):
    lib = _lib(tmp_path)
    with session_factory() as s:
        row = asyncio.run(lib.follow(s, "@BlenderOfficial"))
        assert row.channel_id == "UCSMOQeBJ2RAnuFungnQOxLg"  # the real id, not the handle
        feed = lib.feed(s, 10)
        assert [(f.video_id, f.duration_seconds, f.channel_name) for f in feed] == [(VID, 635, "Blender")]
        lib.unfollow(s, row.channel_id)
        assert lib.feed(s, 10) == [] and lib.followed(s) == []


def test_progress_resumes_until_the_last_30_seconds(tmp_path, session_factory):
    lib = _lib(tmp_path)
    card = VideoCard(VID, "BBB", duration_seconds=635)
    with session_factory() as s:
        lib.record_progress(s, card, 5, None)
        assert lib.continue_watching(s, 10) == []  # barely started
        lib.record_progress(s, card, 300, None)
        assert lib.resume_position(s, VID) == 300 and len(lib.continue_watching(s, 10)) == 1
        lib.record_progress(s, card, 610, None)
        assert lib.resume_position(s, VID) is None and lib.continue_watching(s, 10) == []
        assert lib.history(s)[0].finished


def test_watch_later_round_trip(tmp_path, session_factory):
    lib = _lib(tmp_path)
    with session_factory() as s:
        lib.add_later(s, VideoCard(VID, "BBB"))
        lib.add_later(s, VideoCard(VID, "BBB"))
        assert lib.is_later(s, VID) and len(lib.later(s)) == 1
        lib.remove_later(s, VID)
        assert not lib.is_later(s, VID)


def test_a_failing_rss_feed_falls_back_to_the_channel_list_and_dates_follow_later(tmp_path, session_factory):
    class FlakyWeb(FakeWeb):
        down = True
        calls = 0

        async def channel_feed(self, channel_id):
            self.calls += 1
            if self.down:
                raise TubeUnavailableError("HTTP 500")
            return await super().channel_feed(channel_id)

    web = FlakyWeb()
    lib = _lib(tmp_path, web)
    with session_factory() as s:
        row = asyncio.run(lib.follow(s, "UCSMOQeBJ2RAnuFungnQOxLg"))
        assert web.calls == 3  # retried
        feed = lib.feed(s, 10)
        assert [(f.video_id, f.published_at) for f in feed] == [(VID, None)]  # there, date unknown
        assert "no publish dates" in row.last_error
        web.down = False
        asyncio.run(lib.refresh_channel(s, row))
        assert lib.feed(s, 10)[0].published_at is not None and row.last_error is None

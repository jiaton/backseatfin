import asyncio
import os
import time
from pathlib import Path

from app.emby.ports import EmbyNotFoundError
from app.emby.subtitles import KEEP_DAYS, SubtitleCache


class SlowApi:
    def __init__(self, delay: float = 0.0, fail: Exception | None = None) -> None:
        self.delay = delay
        self.fail = fail
        self.calls = 0

    async def download_subtitle(self, item_id, media_source_id, index, token, dest: Path, timeout=60):
        self.calls += 1
        await asyncio.sleep(self.delay)
        if self.fail:
            raise self.fail
        dest.write_text("[Script Info]")


async def test_slow_extraction_does_not_block_and_finishes_in_background(tmp_path):
    api = SlowApi(delay=0.3)
    cache = SubtitleCache(api, tmp_path)
    assert await cache.wait("5", "ms", 4, "t", timeout=0.05) is None  # playback goes on without it
    assert cache.status("5", "ms", 4, "t") == ("pending", None)
    await asyncio.sleep(0.4)
    assert cache.status("5", "ms", 4, "t") == ("ready", None)
    assert (await cache.wait("5", "ms", 4, "t", timeout=0.05)).name == "5-ms-4.ass"
    assert api.calls == 1  # one extraction, however often it was asked for


async def test_missing_subtitle_is_reported_failed(tmp_path):
    cache = SubtitleCache(SlowApi(fail=EmbyNotFoundError("subtitle 4 unavailable (404)")), tmp_path)
    assert await cache.wait("5", "ms", 4, "t", timeout=1) is None
    assert cache.status("5", "ms", 4, "t") == ("failed", "subtitle 4 unavailable (404)")
    assert not list(tmp_path.glob("*.part"))


def test_prune_drops_only_old_files(tmp_path):
    cache = SubtitleCache(SlowApi(), tmp_path)
    old, fresh = tmp_path / "old.ass", tmp_path / "fresh.ass"
    old.write_text("x")
    fresh.write_text("x")
    long_ago = time.time() - (KEEP_DAYS + 1) * 86400
    os.utime(old, (long_ago, long_ago))
    cache.prune()
    assert not old.exists() and fresh.exists()

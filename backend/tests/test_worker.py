import asyncio
from pathlib import Path

from app.youtube.models import Video, VideoStatus
from app.youtube.ports import DownloadCancelledError, DownloadedVideo
from app.youtube.worker import DownloadWorker


class FakeSource:
    def __init__(self, fail: Exception | None = None, block: bool = False) -> None:
        self.fail = fail
        self.block = block

    def fetch_playlist(self, url):
        raise NotImplementedError

    def download(self, video_id, workdir: Path, should_cancel) -> DownloadedVideo:
        if self.block:
            while not should_cancel():
                pass
            raise DownloadCancelledError(video_id)
        if self.fail:
            raise self.fail
        media = workdir / f"{video_id}.mp4"
        media.write_bytes(b"video")
        thumb = workdir / f"{video_id}.jpg"
        thumb.write_bytes(b"jpg")
        return DownloadedVideo(video_id, "Title", "Chan", "20260101", "d", 60, media, thumb)


class FakeLibrary:
    def __init__(self) -> None:
        self.notified: list[Path] = []

    async def notify_new_files(self, paths):
        self.notified.extend(paths)


def _worker(tmp_path, session_factory, source, library=None):
    return DownloadWorker(source, library or FakeLibrary(), session_factory, tmp_path / "lib", tmp_path / "tmp")


def _add(session_factory, status=VideoStatus.QUEUED) -> int:
    with session_factory() as s:
        v = Video(youtube_id="vid1", title="t", status=status)
        s.add(v)
        s.commit()
        return v.id


async def _run_until(worker, session_factory, vid, statuses, timeout=5.0):
    worker.start()
    try:
        for _ in range(int(timeout / 0.02)):
            with session_factory() as s:
                v = s.get(Video, vid)
                if v.status in statuses:
                    return v
            await asyncio.sleep(0.02)
        raise AssertionError(f"video never reached {statuses}")
    finally:
        await worker.stop()


async def test_download_is_placed_in_library_with_sidecars(tmp_path, session_factory):
    library = FakeLibrary()
    vid = _add(session_factory)
    v = await _run_until(_worker(tmp_path, session_factory, FakeSource(), library), session_factory, vid,
                         {VideoStatus.DONE, VideoStatus.FAILED})
    assert v.status == VideoStatus.DONE, v.error
    season = tmp_path / "lib" / "Chan" / "Season 2026"
    names = sorted(p.name for p in season.iterdir())
    assert names == [
        "2026-01-01 - Title [vid1]-thumb.jpg",
        "2026-01-01 - Title [vid1].mp4",
        "2026-01-01 - Title [vid1].nfo",
    ]
    assert (tmp_path / "lib" / "Chan" / "tvshow.nfo").exists()
    assert library.notified == [season / "2026-01-01 - Title [vid1].mp4"]
    assert v.file_path == str(season / "2026-01-01 - Title [vid1].mp4")
    assert not (tmp_path / "tmp" / "vid1").exists()


async def test_download_error_marks_failed_with_message(tmp_path, session_factory):
    vid = _add(session_factory)
    v = await _run_until(_worker(tmp_path, session_factory, FakeSource(fail=RuntimeError("boom"))),
                         session_factory, vid, {VideoStatus.FAILED})
    assert v.error == "boom" and v.attempts == 1


async def test_user_cancel_marks_cancelled_not_failed(tmp_path, session_factory):
    vid = _add(session_factory)
    worker = _worker(tmp_path, session_factory, FakeSource(block=True))
    worker.start()
    for _ in range(100):
        if worker.request_cancel(vid):
            break
        await asyncio.sleep(0.02)
    v = await _run_until(worker, session_factory, vid, {VideoStatus.CANCELLED})
    assert v.status == VideoStatus.CANCELLED


async def test_startup_requeues_rows_left_downloading(tmp_path, session_factory):
    vid = _add(session_factory, status=VideoStatus.DOWNLOADING)
    v = await _run_until(_worker(tmp_path, session_factory, FakeSource()), session_factory, vid, {VideoStatus.DONE})
    assert v.status == VideoStatus.DONE

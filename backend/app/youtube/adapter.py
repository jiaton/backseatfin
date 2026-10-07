"""yt-dlp implementation of VideoSourcePort — the only module that imports yt_dlp."""

import logging
from collections.abc import Callable
from pathlib import Path

import yt_dlp
from yt_dlp.utils import DownloadCancelled, DownloadError

from app.youtube.ports import (
    DownloadCancelledError,
    DownloadedVideo,
    PlaylistEntry,
    PlaylistInfo,
    SourceUnavailableError,
)

log = logging.getLogger(__name__)

# Placeholder titles YouTube returns for entries the viewer can't see.
_UNAVAILABLE_TITLES = {"[Private video]", "[Deleted video]"}


class YtDlpVideoSource:
    def __init__(self, max_height: int) -> None:
        self._max_height = max_height

    def fetch_playlist(self, url: str) -> PlaylistInfo:
        opts = {"extract_flat": "in_playlist", "skip_download": True, "quiet": True, "no_warnings": True}
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
        except DownloadError as e:
            raise SourceUnavailableError(str(e)) from e
        entries = [
            PlaylistEntry(
                video_id=e["id"],
                title=e.get("title") or e["id"],
                channel=e.get("channel") or e.get("uploader"),
                duration_seconds=int(e["duration"]) if e.get("duration") else None,
            )
            for e in info.get("entries") or []
            if e and e.get("id") and e.get("title") not in _UNAVAILABLE_TITLES
        ]
        return PlaylistInfo(title=info.get("title") or url, entries=entries)

    def download(self, video_id: str, workdir: Path, should_cancel: Callable[[], bool]) -> DownloadedVideo:
        def hook(_progress: dict) -> None:
            if should_cancel():
                raise DownloadCancelled("cancel requested")

        h = self._max_height
        opts = {
            # H.264 + AAC in MP4 first: Emby can direct-play it on nearly every client
            # (including the car browser while parked) without transcoding.
            "format": (
                f"bv*[vcodec^=avc1][height<={h}]+ba[ext=m4a]"
                f"/b[ext=mp4][height<={h}]"
                f"/bv*[height<={h}]+ba/b"
            ),
            "merge_output_format": "mp4",
            "outtmpl": str(workdir / "%(id)s.%(ext)s"),
            "writethumbnail": True,
            "postprocessors": [{"key": "FFmpegThumbnailsConvertor", "format": "jpg"}],
            "progress_hooks": [hook],
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,
        }
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=True)
        except DownloadCancelled as e:
            raise DownloadCancelledError(video_id) from e

        media = [p for p in workdir.iterdir() if p.stem == video_id and p.suffix not in {".jpg", ".part"}]
        if not media:
            raise RuntimeError(f"yt-dlp finished but produced no media file for {video_id}")
        thumb = workdir / f"{video_id}.jpg"
        return DownloadedVideo(
            video_id=video_id,
            title=info.get("title") or video_id,
            channel=info.get("channel") or info.get("uploader") or "Unknown",
            upload_date=info.get("upload_date"),
            description=info.get("description") or "",
            duration_seconds=int(info["duration"]) if info.get("duration") else None,
            media_path=media[0],
            thumbnail_path=thumb if thumb.exists() else None,
        )

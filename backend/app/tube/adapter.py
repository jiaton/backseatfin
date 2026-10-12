"""yt-dlp implementation of TubeSourcePort — the only module here that imports yt_dlp."""

import logging
from datetime import datetime, timezone
from urllib.parse import parse_qs, quote_plus, urlparse

import yt_dlp
from yt_dlp.utils import DownloadError

from app.tube.urls import video_thumbnail
from app.tube.ports import (
    ChannelCard,
    ChannelPage,
    Chapter,
    MediaFormat,
    PlaylistCard,
    PlaylistPage,
    SearchKind,
    SearchResults,
    TubeUnavailableError,
    VideoCard,
    VideoDetails,
)

log = logging.getLogger(__name__)

_BASE = {"skip_download": True, "quiet": True, "no_warnings": True}
_FLAT = {**_BASE, "extract_flat": "in_playlist"}
# YouTube's search filters (the "sp" parameter of its results page).
_SEARCH_FILTER = {SearchKind.CHANNELS: "EgIQAg%3D%3D", SearchKind.PLAYLISTS: "EgIQAw%3D%3D"}
_HIDDEN_TITLES = {"[Private video]", "[Deleted video]"}


def _abs(url: str | None) -> str | None:
    return f"https:{url}" if url and url.startswith("//") else url


def _thumb_by_id(info: dict, *ids: str) -> str | None:
    by_id = {t.get("id"): t.get("url") for t in info.get("thumbnails") or []}
    return next((_abs(by_id[i]) for i in ids if by_id.get(i)), None)


def _largest_thumb(info: dict) -> str | None:
    thumbs = [t for t in info.get("thumbnails") or [] if t.get("url")]
    return _abs(max(thumbs, key=lambda t: t.get("width") or 0)["url"]) if thumbs else None


def _int(v) -> int | None:
    return int(v) if isinstance(v, (int, float)) else None


def _video_card(e: dict, channel_id: str | None = None, channel_name: str | None = None) -> VideoCard:
    ts = e.get("timestamp") or e.get("release_timestamp")
    return VideoCard(
        id=e["id"],
        title=e.get("title") or e["id"],
        channel_id=e.get("channel_id") or channel_id,
        channel_name=e.get("channel") or e.get("uploader") or channel_name,
        duration_seconds=_int(e.get("duration")),
        view_count=_int(e.get("view_count")),
        published_at=datetime.fromtimestamp(ts, timezone.utc) if ts else None,
        thumbnail_url=video_thumbnail(e["id"]),
        is_live=e.get("live_status") == "is_live" or bool(e.get("is_live")),
    )


def _is_video(e: dict | None) -> bool:
    return bool(e and e.get("id") and e.get("title") not in _HIDDEN_TITLES and e.get("ie_key", "Youtube") == "Youtube")


def _expiry(formats: list[MediaFormat]) -> float | None:
    for f in formats:
        values = parse_qs(urlparse(f.url).query).get("expire")
        if values and values[0].isdigit():
            return float(values[0])
    return None


class YtDlpTube:
    def _extract(self, url: str, opts: dict) -> dict:
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
        except DownloadError as e:
            raise TubeUnavailableError(str(e).removeprefix("ERROR: ")) from e
        if not info:
            raise TubeUnavailableError(f"nothing at {url}")
        return info

    def search(self, query: str, kind: SearchKind, limit: int) -> SearchResults:
        if kind is SearchKind.VIDEOS:
            info = self._extract(f"ytsearch{limit}:{query}", _FLAT)
            return SearchResults(videos=[_video_card(e) for e in info.get("entries") or [] if _is_video(e)])
        url = f"https://www.youtube.com/results?search_query={quote_plus(query)}&sp={_SEARCH_FILTER[kind]}"
        entries = [e for e in self._extract(url, {**_FLAT, "playlistend": limit}).get("entries") or [] if e]
        if kind is SearchKind.CHANNELS:
            return SearchResults(channels=[
                ChannelCard(
                    id=e.get("channel_id") or e["id"], name=e.get("channel") or e.get("title") or e["id"],
                    handle=e.get("uploader_id"), avatar_url=_largest_thumb(e),
                    subscriber_count=_int(e.get("channel_follower_count")),
                )
                for e in entries if e.get("ie_key") == "YoutubeTab"
            ])
        return SearchResults(playlists=[
            PlaylistCard(
                id=e["id"], title=e.get("title") or e["id"], channel_name=e.get("channel") or e.get("uploader"),
                video_count=_int(e.get("playlist_count")), thumbnail_url=_largest_thumb(e),
            )
            for e in entries if e.get("id")
        ])

    def video(self, video_id: str) -> VideoDetails:
        info = self._extract(f"https://www.youtube.com/watch?v={video_id}", _BASE)
        formats = [
            MediaFormat(
                format_id=str(f["format_id"]), url=f["url"],
                vcodec=None if f.get("vcodec") in (None, "none") else f["vcodec"],
                acodec=None if f.get("acodec") in (None, "none") else f["acodec"],
                height=_int(f.get("height")), width=_int(f.get("width")), kbps=f.get("tbr"),
                protocol=f.get("protocol") or "https",
            )
            for f in info.get("formats") or []
            if f.get("url") and f.get("format_id")
        ]
        return VideoDetails(
            card=_video_card(info),
            description=info.get("description") or "",
            chapters=[Chapter(float(c["start_time"]), c.get("title") or "") for c in info.get("chapters") or []],
            formats=formats,
            expires_at=_expiry([f for f in formats if f.protocol == "https"]),
        )

    def channel(self, channel_id: str, limit: int) -> ChannelPage:
        path = channel_id if channel_id.startswith("@") else f"channel/{channel_id}"
        info = self._extract(f"https://www.youtube.com/{path}/videos", {**_FLAT, "playlistend": limit})
        cid = info.get("channel_id") or channel_id
        name = info.get("channel") or info.get("uploader") or cid
        return ChannelPage(
            channel=ChannelCard(
                id=cid, name=name, handle=info.get("uploader_id"),
                avatar_url=_thumb_by_id(info, "avatar_uncropped"), subscriber_count=_int(info.get("channel_follower_count")),
            ),
            banner_url=_thumb_by_id(info, "banner_uncropped"),
            description=info.get("description") or "",
            videos=[_video_card(e, cid, name) for e in info.get("entries") or [] if _is_video(e)],
        )

    def playlist(self, playlist_id: str, limit: int) -> PlaylistPage:
        info = self._extract(f"https://www.youtube.com/playlist?list={playlist_id}", {**_FLAT, "playlistend": limit})
        videos = [_video_card(e) for e in info.get("entries") or [] if _is_video(e)]
        return PlaylistPage(
            playlist=PlaylistCard(
                id=playlist_id, title=info.get("title") or playlist_id, channel_name=info.get("channel") or info.get("uploader"),
                video_count=_int(info.get("playlist_count")), thumbnail_url=videos[0].thumbnail_url if videos else None,
            ),
            videos=videos,
        )

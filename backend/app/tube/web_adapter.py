"""httpx implementation of TubeWebPort: channel RSS feeds, images, stream URL checks."""

import logging
import xml.etree.ElementTree as ET
from datetime import datetime

import httpx

from app.tube.ports import TubeUnavailableError, VideoCard
from app.tube.urls import video_thumbnail

log = logging.getLogger(__name__)

_NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015", "media": "http://search.yahoo.com/mrss/"}
_TIMEOUT = httpx.Timeout(10.0)


class HttpTubeWeb:
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=False, headers={"User-Agent": "Mozilla/5.0"})

    async def channel_feed(self, channel_id: str) -> list[VideoCard]:
        try:
            resp = await self._client.get("https://www.youtube.com/feeds/videos.xml", params={"channel_id": channel_id})
            resp.raise_for_status()
            root = ET.fromstring(resp.content)
        except (httpx.HTTPError, ET.ParseError) as e:
            raise TubeUnavailableError(f"channel feed {channel_id}: {e}") from e
        name = root.findtext("a:author/a:name", default=None, namespaces=_NS)
        cards = []
        for entry in root.findall("a:entry", _NS):
            vid = entry.findtext("yt:videoId", namespaces=_NS)
            if not vid:
                continue
            published = entry.findtext("a:published", namespaces=_NS)
            stats = entry.find("media:group/media:community/media:statistics", _NS)
            views = stats.get("views") if stats is not None else None
            cards.append(VideoCard(
                id=vid,
                title=entry.findtext("a:title", default=vid, namespaces=_NS),
                channel_id=channel_id,
                channel_name=name,
                published_at=datetime.fromisoformat(published) if published else None,
                view_count=int(views) if views and views.isdigit() else None,
                thumbnail_url=video_thumbnail(vid),
            ))
        return cards

    async def fetch_image(self, url: str) -> tuple[bytes, str]:
        try:
            resp = await self._client.get(url)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            raise TubeUnavailableError(f"image: {e}") from e
        content_type = resp.headers.get("content-type", "image/jpeg").split(";")[0]
        if not content_type.startswith("image/"):
            raise TubeUnavailableError(f"not an image ({content_type})")
        return resp.content, content_type

    async def fetch_text(self, url: str) -> str:
        try:
            resp = await self._client.get(url)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            raise TubeUnavailableError(f"captions: {e}") from e
        return resp.text

    async def url_works(self, url: str) -> bool:
        try:
            resp = await self._client.get(url, headers={"Range": "bytes=0-0"})
        except httpx.HTTPError as e:
            log.info("stream URL check failed: %s", type(e).__name__)
            return False
        return resp.status_code in (200, 206)

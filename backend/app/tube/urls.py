"""Pure helpers about YouTube URLs and ids."""

import re
from urllib.parse import parse_qs, urlparse

VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
CHANNEL_ID = re.compile(r"^(UC[A-Za-z0-9_-]{22}|@[A-Za-z0-9._-]{3,100})$")
PLAYLIST_ID = re.compile(r"^[A-Za-z0-9_-]{10,64}$")

# Where YouTube serves thumbnails, avatars and banners. The image proxy fetches only from
# these, so it can't be pointed at anything else (the server's LAN, for one).
IMAGE_HOSTS = ("i.ytimg.com", "i9.ytimg.com", "yt3.ggpht.com", "yt3.googleusercontent.com")


def video_thumbnail(video_id: str) -> str:
    """480×360 with letterbox bars (the page crops them): a quarter of hq720's bytes."""
    return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"


def is_youtube_image(url: str) -> bool:
    try:
        u = urlparse(url)
    except ValueError:
        return False
    return u.scheme == "https" and u.hostname in IMAGE_HOSTS and u.port is None and not u.username


def parse_link(text: str) -> tuple[str, str] | None:
    """("video" | "channel" | "playlist", id) for a pasted YouTube link or bare id."""
    text = text.strip()
    if VIDEO_ID.match(text):
        return "video", text
    try:
        u = urlparse(text if "://" in text else f"https://{text}")
    except ValueError:
        return None
    host = (u.hostname or "").removeprefix("www.").removeprefix("m.")
    q = parse_qs(u.query)
    parts = [p for p in u.path.split("/") if p]
    if host == "youtu.be" and parts and VIDEO_ID.match(parts[0]):
        return "video", parts[0]
    if host not in ("youtube.com", "music.youtube.com"):
        return None
    if parts[:1] == ["watch"] and q.get("v") and VIDEO_ID.match(q["v"][0]):
        return "video", q["v"][0]
    if len(parts) >= 2 and parts[0] in ("shorts", "live", "embed") and VIDEO_ID.match(parts[1]):
        return "video", parts[1]
    if parts[:1] == ["playlist"] and q.get("list") and PLAYLIST_ID.match(q["list"][0]):
        return "playlist", q["list"][0]
    if len(parts) >= 2 and parts[0] == "channel" and CHANNEL_ID.match(parts[1]):
        return "channel", parts[1]
    if parts and parts[0].startswith("@") and CHANNEL_ID.match(parts[0]):
        return "channel", parts[0]
    return None

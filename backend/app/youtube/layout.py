"""Pure functions deciding where a finished download lives in the Emby library and what
its NFO sidecars say. No I/O except the directory listing passed in by the caller.

Layout (Emby "TV shows" library — a channel is a series, a year is a season):

    <root>/<Channel>/tvshow.nfo
    <root>/<Channel>/Season <YYYY>/<YYYY-MM-DD> - <Title> [<id>].mp4
                                    ... same basename .nfo / -thumb.jpg
"""

import re
from dataclasses import dataclass
from pathlib import Path
from xml.sax.saxutils import escape

from app.youtube.ports import DownloadedVideo

_UNSAFE = re.compile(r'[\\/:*?"<>|\x00-\x1f]')
_MAX_COMPONENT = 120


def safe_component(name: str, fallback: str = "Unknown") -> str:
    cleaned = _UNSAFE.sub(" ", name)
    cleaned = re.sub(r"\s+", " ", cleaned).strip().strip(".")
    return cleaned[:_MAX_COMPONENT].rstrip() or fallback


@dataclass(frozen=True)
class EpisodePlan:
    show_dir: Path
    season_dir: Path
    media_path: Path
    nfo_path: Path
    thumb_path: Path
    season: int
    episode: int
    aired: str | None  # YYYY-MM-DD


def _aired(upload_date: str | None) -> str | None:
    if upload_date and re.fullmatch(r"\d{8}", upload_date):
        return f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:]}"
    return None


def season_dir_for(video: DownloadedVideo, root: Path) -> Path:
    aired = _aired(video.upload_date)
    return root / safe_component(video.channel) / f"Season {aired[:4] if aired else 0}"


def plan_episode(video: DownloadedVideo, root: Path, existing_in_season: list[str]) -> EpisodePlan:
    """existing_in_season: file names already in season_dir_for(video, root), used to
    give same-day uploads distinct episode numbers (Emby sorts and dedupes by number)."""
    aired = _aired(video.upload_date)
    year = int(aired[:4]) if aired else 0
    season_dir = season_dir_for(video, root)
    show_dir = season_dir.parent

    date_prefix = aired or "0000-00-00"
    same_day = sum(1 for n in existing_in_season if n.startswith(date_prefix) and n.endswith(".nfo"))
    # MMDD * 100 + n: sorts by date inside the year, room for 99 uploads per channel-day.
    mmdd = int(aired[5:7] + aired[8:10]) if aired else 0
    episode = mmdd * 100 + same_day + 1

    base = f"{date_prefix} - {safe_component(video.title, video.video_id)} [{video.video_id}]"
    return EpisodePlan(
        show_dir=show_dir,
        season_dir=season_dir,
        media_path=season_dir / f"{base}{video.media_path.suffix or '.mp4'}",
        nfo_path=season_dir / f"{base}.nfo",
        thumb_path=season_dir / f"{base}-thumb.jpg",
        season=year,
        episode=episode,
        aired=aired,
    )


def episode_nfo(video: DownloadedVideo, plan: EpisodePlan) -> str:
    lines = [
        '<?xml version="1.0" encoding="utf-8" standalone="yes"?>',
        "<episodedetails>",
        f"  <title>{escape(video.title)}</title>",
        f"  <plot>{escape(video.description)}</plot>",
        f"  <season>{plan.season}</season>",
        f"  <episode>{plan.episode}</episode>",
        f"  <studio>{escape(video.channel)}</studio>",
        f'  <uniqueid type="youtube" default="true">{escape(video.video_id)}</uniqueid>',
    ]
    if plan.aired:
        lines.append(f"  <aired>{plan.aired}</aired>")
    if video.duration_seconds:
        lines.append(f"  <runtime>{max(1, round(video.duration_seconds / 60))}</runtime>")
    lines.append("</episodedetails>")
    return "\n".join(lines) + "\n"


def tvshow_nfo(channel: str) -> str:
    return (
        '<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n'
        "<tvshow>\n"
        f"  <title>{escape(channel)}</title>\n"
        f"  <studio>{escape(channel)}</studio>\n"
        "  <genre>YouTube</genre>\n"
        "</tvshow>\n"
    )

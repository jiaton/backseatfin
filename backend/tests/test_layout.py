from pathlib import Path

from app.youtube.layout import episode_nfo, plan_episode, safe_component, season_dir_for
from app.youtube.ports import DownloadedVideo


def _video(**kw) -> DownloadedVideo:
    base = dict(
        video_id="abc123",
        title="Hello / World: <part 1>",
        channel="Some Channel",
        upload_date="20260927",
        description="desc & more",
        duration_seconds=125,
        media_path=Path("/tmp/abc123.mp4"),
        thumbnail_path=None,
    )
    base.update(kw)
    return DownloadedVideo(**base)


def test_safe_component_strips_path_and_reserved_chars():
    assert safe_component('a/b\\c:d*e?f"g<h>i|j') == "a b c d e f g h i j"
    assert safe_component("...") == "Unknown"
    assert safe_component("  ") == "Unknown"
    assert len(safe_component("x" * 500)) == 120


def test_plan_places_by_channel_and_year():
    root = Path("/media/youtube")
    plan = plan_episode(_video(), root, [])
    assert plan.season_dir == root / "Some Channel" / "Season 2026"
    assert plan.season_dir == season_dir_for(_video(), root)
    assert plan.media_path.name == "2026-09-27 - Hello World part 1 [abc123].mp4"
    assert plan.nfo_path.name == "2026-09-27 - Hello World part 1 [abc123].nfo"
    assert plan.thumb_path.name == "2026-09-27 - Hello World part 1 [abc123]-thumb.jpg"
    assert (plan.season, plan.episode, plan.aired) == (2026, 92701, "2026-09-27")


def test_same_day_uploads_get_distinct_episode_numbers():
    existing = ["2026-09-27 - First [x].nfo", "2026-09-27 - First [x].mp4", "2026-09-26 - Other [y].nfo"]
    plan = plan_episode(_video(), Path("/r"), existing)
    assert plan.episode == 92702


def test_missing_upload_date_goes_to_season_zero():
    plan = plan_episode(_video(upload_date=None), Path("/r"), [])
    assert plan.season_dir.name == "Season 0"
    assert (plan.season, plan.episode, plan.aired) == (0, 1, None)


def test_nfo_escapes_xml():
    video = _video()
    nfo = episode_nfo(video, plan_episode(video, Path("/r"), []))
    assert "<title>Hello / World: &lt;part 1&gt;</title>" in nfo
    assert "<plot>desc &amp; more</plot>" in nfo
    assert "<aired>2026-09-27</aired>" in nfo
    assert "<runtime>2</runtime>" in nfo

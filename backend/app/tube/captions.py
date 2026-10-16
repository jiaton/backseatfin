"""YouTube captions: which tracks to offer, and json3 → cues. Pure."""

import json

from app.tube.ports import CaptionTrack, Cue

# The languages the app speaks (its own UI's), as YouTube names them.
VIEWER_LANGS = ("en", "zh-Hans", "zh-Hant", "zh-CN", "zh-TW", "es", "ja", "ko")
# Plenty for a car screen; YouTube lists 60+ uploaded tracks and 160+ automatic ones.
MAX_TRACKS = 12


def _json3(formats: list[dict]) -> str | None:
    return next((f["url"] for f in formats if f.get("ext") == "json3" and f.get("url")), None)


def pick_tracks(subtitles: dict, automatic: dict, video_lang: str | None) -> list[CaptionTrack]:
    """The uploader's tracks in the video's language and the app's languages (in that
    order), then YouTube's automatic captions in the video's language ("-orig") when
    the uploader has none in it. Machine translations of automatic captions aren't
    offered: YouTube refuses them to non-browsers (429) more often than not."""
    wanted = list(dict.fromkeys(l for l in (video_lang, *VIEWER_LANGS) if l))
    base = (video_lang or "").split("-")[0]

    def rank(lang: str) -> int:
        if lang in wanted:
            return wanted.index(lang)
        return 0 if base and lang.split("-")[0] == base else len(wanted)

    tracks: list[CaptionTrack] = []
    for lang in sorted((l for l in subtitles if l != "live_chat" and rank(l) < len(wanted)), key=rank):
        if url := _json3(subtitles[lang]):
            tracks.append(CaptionTrack(f"sub:{lang}", lang, subtitles[lang][0].get("name") or lang, False, url))
    have = {t.lang.split("-")[0] for t in tracks}
    for lang in (l for l in automatic if l.endswith("-orig")):
        orig = lang.removesuffix("-orig")
        if orig.split("-")[0] in have:
            continue  # the uploader's own track is better
        if url := _json3(automatic[lang]):
            tracks.append(CaptionTrack(f"auto:{lang}", orig, automatic[lang][0].get("name") or orig, True, url))
    return tracks[:MAX_TRACKS]


def parse_json3(text: str) -> list[Cue]:
    """YouTube's json3 captions → cues. Automatic captions come as rolling events (a
    line, then words appended to it); each event is one cue of its own text."""
    events = json.loads(text).get("events") or []
    cues: list[Cue] = []
    for e in events:
        segs = e.get("segs")
        if not segs or "tStartMs" not in e:
            continue
        line = "".join(s.get("utf8", "") for s in segs).strip()
        if not line:
            continue
        start = e["tStartMs"] / 1000
        cues.append(Cue(start, start + (e.get("dDurationMs") or 0) / 1000, line))
    return cues

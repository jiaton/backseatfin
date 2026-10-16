"""Which of YouTube's streams to send the car. Pure."""

from dataclasses import dataclass

from app.tube.ports import MediaFormat


@dataclass(frozen=True)
class StreamChoice:
    video: MediaFormat
    audio: MediaFormat | None
    # True: H.264 the car decodes as it is, so it's passed through untouched.
    copy: bool


def _fits(f: MediaFormat, max_height: int, max_width: int | None) -> bool:
    # Portrait videos (Shorts) are limited by the box too: compare the short side to the
    # height and the long side to the width.
    w, h = f.width or 0, f.height or 0
    short, long = min(w, h) if w and h else h, max(w, h)
    return short <= max_height and (max_width is None or long <= max_width)


def pick_stream(formats: list[MediaFormat], max_height: int, max_width: int | None, live: bool = False) -> StreamChoice | None:
    """The best H.264 picture that fits the level and the screen, plus AAC sound; if
    the video has no H.264 at all, the best other picture (to be transcoded). A video
    plays from its plain HTTPS files; a live stream has only HLS ones."""
    direct = [f for f in formats if (f.protocol.startswith("m3u8") if live else f.protocol == "https")]
    videos = [f for f in direct if f.vcodec and not f.acodec]
    audios = [f for f in direct if f.acodec and not f.vcodec]
    # "-drc" = dynamic range compressed: quieter loud scenes, not what the film sounds like.
    aac = sorted((f for f in audios if f.acodec.startswith("mp4a") and "drc" not in f.format_id), key=lambda f: f.kbps or 0)
    # Live sound formats have no codec name or rate: the higher id is the better one.
    audio = aac[-1] if aac else max(audios, key=lambda f: (f.kbps or 0, f.format_id), default=None)

    def best(candidates: list[MediaFormat]) -> MediaFormat | None:
        fitting = [f for f in candidates if _fits(f, max_height, max_width)]
        pool = fitting or sorted(candidates, key=lambda f: f.height or 0)[:1]
        return max(pool, key=lambda f: ((f.height or 0), f.kbps or 0), default=None)

    if video := best([f for f in videos if f.vcodec.startswith("avc1")]):
        return StreamChoice(video, audio, copy=True)
    if video := best(videos):
        return StreamChoice(video, audio, copy=False)
    return None

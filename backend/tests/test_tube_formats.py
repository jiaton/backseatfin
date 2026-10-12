from app.tube.formats import pick_stream
from app.tube.ports import MediaFormat


def _v(fid, h, w=None, codec="avc1.640028", proto="https"):
    return MediaFormat(fid, f"https://v.example.com/{fid}", vcodec=codec, acodec=None, height=h, width=w or h * 16 // 9, protocol=proto)


def _a(fid, codec="mp4a.40.2", kbps=128):
    return MediaFormat(fid, f"https://v.example.com/{fid}", vcodec=None, acodec=codec, kbps=kbps)


FORMATS = [
    _v("134", 360), _v("135", 480), _v("298", 720), _v("299", 1080), _v("312", 1080, proto="m3u8_native"),
    _v("303", 1080, codec="vp9"), _v("401", 2160, codec="av01.0.12M.08"),
    _a("139", kbps=48), _a("140"), _a("140-drc"), _a("251", codec="opus", kbps=160),
]


def test_best_h264_that_fits_the_level_and_screen_is_copied_with_aac():
    c = pick_stream(FORMATS, 720, 1920)
    assert (c.video.format_id, c.audio.format_id, c.copy) == ("298", "140", True)
    assert pick_stream(FORMATS, 1080, None).video.format_id == "299"  # https, not the HLS one
    assert pick_stream(FORMATS, 1080, 1000).video.format_id == "135"  # the window is only 1000 wide


def test_portrait_video_is_limited_by_its_short_side():
    shorts = [_v("a", 1920, 1080), _v("b", 1280, 720), _a("140")]
    assert pick_stream(shorts, 720, 1280).video.format_id == "b"


def test_smallest_h264_when_nothing_fits_and_transcode_without_h264():
    assert pick_stream([_v("298", 720), _a("140")], 480, None).video.format_id == "298"
    c = pick_stream([_v("303", 1080, codec="vp9"), _a("251", codec="opus")], 720, None)
    assert (c.video.format_id, c.audio.format_id, c.copy) == ("303", "251", False)
    assert pick_stream([_a("140")], 720, None) is None

from app.tube.adapter import _is_video


def test_unavailable_playlist_entries_are_left_out():
    # Regression: YouTube hid a removed video on the playlist's page, but yt-dlp still
    # listed it with no title; it showed on home as its id and stopped play-through.
    assert not _is_video({"id": "YRtYalhmuWA", "title": None, "ie_key": "Youtube"})
    assert not _is_video({"id": "a1", "title": "[Deleted video]"})
    assert not _is_video({"id": "a1", "title": "[Private video]"})
    assert not _is_video({"id": "a1", "title": "A channel", "ie_key": "YoutubeTab"})
    assert _is_video({"id": "a1", "title": "A video", "ie_key": "Youtube"})

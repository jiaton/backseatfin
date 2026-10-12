import pytest

from app.tube.urls import is_youtube_image, parse_link


@pytest.mark.parametrize(
    "text, expected",
    [
        ("https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=30", ("video", "aqz-KE-bpKQ")),
        ("youtu.be/aqz-KE-bpKQ?si=abc", ("video", "aqz-KE-bpKQ")),
        ("https://m.youtube.com/shorts/aqz-KE-bpKQ", ("video", "aqz-KE-bpKQ")),
        ("aqz-KE-bpKQ", ("video", "aqz-KE-bpKQ")),
        ("https://www.youtube.com/playlist?list=PLa1F2ddGya_-UvuAqHAksYnB0qL9yWDO6", ("playlist", "PLa1F2ddGya_-UvuAqHAksYnB0qL9yWDO6")),
        ("https://www.youtube.com/@BlenderStudio/videos", ("channel", "@BlenderStudio")),
        ("https://www.youtube.com/channel/UCz75RVbH8q2jdBJ4SnwuZZQ", ("channel", "UCz75RVbH8q2jdBJ4SnwuZZQ")),
        ("https://evil.example.com/watch?v=aqz-KE-bpKQ", None),
        ("not a link at all", None),
    ],
)
def test_parse_link(text, expected):
    assert parse_link(text) == expected


@pytest.mark.parametrize(
    "url, ok",
    [
        ("https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg", True),
        ("https://yt3.ggpht.com/abc=s176", True),
        ("http://i.ytimg.com/vi/x/hqdefault.jpg", False),  # https only
        ("https://i.ytimg.com.evil.example.com/x.jpg", False),
        ("https://user@i.ytimg.com/x.jpg", False),
        ("https://i.ytimg.com:8443/x.jpg", False),
        ("https://192.168.1.1/x.jpg", False),
    ],
)
def test_image_proxy_only_fetches_from_youtube_image_hosts(url, ok):
    assert is_youtube_image(url) is ok

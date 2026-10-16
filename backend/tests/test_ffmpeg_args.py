from pathlib import Path

import pytest

from app.stream.adapter import ToneMapping, build_ffmpeg_args
from app.stream.ports import ImageSubtitle, OutputFormat, StreamSpec, TextSubtitle


def _spec(**kw) -> StreamSpec:
    kw.setdefault("output", OutputFormat.JSMPEG_TS)
    return StreamSpec(input_url="http://emby/x", **kw)


def _graph(args: list[str]) -> str:
    return args[args.index("-filter_complex") + 1]


def _maps(args: list[str]) -> list[str]:
    return [args[i + 1] for i, a in enumerate(args) if a == "-map"]


def test_jsmpeg_output_is_mpeg1_mp2_ts_paced_and_seeks_before_input():
    args = build_ffmpeg_args(_spec(start_seconds=90))
    assert args.index("-ss") < args.index("-i")
    assert args[args.index("-ss") + 1] == "90.000"
    assert "-re" in args
    assert args[args.index("-c:v") + 1] == "mpeg1video"
    assert args[args.index("-c:a") + 1] == "mp2"
    assert args[args.index("-f", args.index("-c:v")) + 1] == "mpegts"


def test_token_goes_in_headers_not_url_and_tracks_are_mapped_by_absolute_index():
    args = build_ffmpeg_args(_spec(input_headers={"X-Emby-Token": "secret"}, video_stream_index=0, audio_stream_index=2))
    assert args[args.index("-headers") + 1] == "X-Emby-Token: secret\r\n"
    assert args.index("-headers") < args.index("-i")
    assert all("secret" not in a for a in args if a != "X-Emby-Token: secret\r\n")
    assert _graph(args).startswith("[0:0]")
    assert _maps(args) == ["[v]", "0:2"]


def test_default_audio_is_optional():
    assert _maps(build_ffmpeg_args(_spec())) == ["[v]", "0:a:0?"]


def test_image_subtitle_is_overlaid_without_time_shift():
    graph = _graph(build_ffmpeg_args(_spec(start_seconds=1800, video_stream_index=0, subtitle=ImageSubtitle(4))))
    assert graph.startswith("[0:0][0:4]overlay,scale=")
    assert "setpts" not in graph


def test_text_subtitle_is_burned_in_with_seek_offset():
    graph = _graph(build_ffmpeg_args(_spec(start_seconds=1800, subtitle=TextSubtitle(Path("/app/data/tmp/subs/ab12.ass")))))
    assert graph == (
        "[0:v:0]setpts=PTS+1800.000/TB,subtitles=filename=/app/data/tmp/subs/ab12.ass,"
        "setpts=PTS-STARTPTS,scale=-2:'min(720,ih)',setsar=1[v]"
    )


def test_subtitle_path_with_filtergraph_syntax_is_rejected():
    with pytest.raises(ValueError):
        build_ffmpeg_args(_spec(subtitle=TextSubtitle(Path("/tmp/x',movie=/etc/passwd.ass"))))


def test_frame_rate_and_bitrate_come_from_the_spec():
    args = build_ffmpeg_args(_spec(frame_rate="24000/1001", video_kbps=2000, max_height=480))
    assert args[args.index("-r") + 1] == "24000/1001"
    assert args[args.index("-b:v") + 1] == "2000k" and args[args.index("-maxrate") + 1] == "4000k"
    assert "min(480,ih)" in _graph(args)
    assert build_ffmpeg_args(_spec())[build_ffmpeg_args(_spec()).index("-r") + 1] == "30"


@pytest.mark.parametrize(
    ("source", "expected"),
    [(23.976, "24000/1001"), (24.0, "24"), (25.0, "25"), (29.97, "30000/1001"), (30.0, "30"),
     (50.0, "25"), (59.94, "30000/1001"), (60.0, "30"), (15.0, "24000/1001"), (None, "30"), (0, "30")],
)
def test_mpeg1_frame_rate_snaps_to_legal_rates(source, expected):
    from app.stream.ports import mpeg1_frame_rate

    assert mpeg1_frame_rate(source) == expected


def test_webcodecs_ts_output_is_h264_high_aac_ts_with_initial_burst():
    args = build_ffmpeg_args(_spec(output=OutputFormat.H264_TS, start_seconds=60, video_kbps=3000, max_height=1080))
    assert args.index("-readrate_initial_burst") < args.index("-re") < args.index("-i")
    assert args[args.index("-c:v") + 1] == "libx264" and args[args.index("-profile:v") + 1] == "high"
    assert args[args.index("-pix_fmt") + 1] == "yuv420p" and args[args.index("-bf") + 1] == "0"
    assert args[args.index("-c:a") + 1] == "aac" and args[args.index("-ar") + 1] == "48000"
    assert args[args.index("-f", args.index("-c:v")) + 1] == "mpegts"
    assert _maps(args) == ["[v]", "0:a:0?"]
    # MPEG-1 output never gets the burst (JSMpeg has no buffer to absorb it)
    assert "-readrate_initial_burst" not in build_ffmpeg_args(_spec(start_seconds=60))


def test_quality_presets_differ_per_codec():
    from app.stream.ports import OutputFormat as F, Quality, quality_preset

    assert quality_preset(F.JSMPEG_TS, Quality.HIGH) == (720, 3500)
    assert quality_preset(F.H264_TS, Quality.HIGH) == (1080, 3000)


def test_fast_probe_is_on_by_default_and_can_be_turned_off():
    args = build_ffmpeg_args(_spec())
    assert args.index("-probesize") < args.index("-i") and args[args.index("-probesize") + 1] == "1M"
    assert "-probesize" not in build_ffmpeg_args(_spec(), fast_probe=False)
    assert "-probesize" not in build_ffmpeg_args(StreamSpec(input_url=None, output=OutputFormat.JSMPEG_TS))


def test_webcodecs_ts_uses_zerolatency():
    args = build_ffmpeg_args(_spec(output=OutputFormat.H264_TS))
    assert args[args.index("-tune") + 1] == "zerolatency"


GPU = ToneMapping("/usr/lib/jellyfin-ffmpeg/ffmpeg", "/dev/dri/renderD128")
CPU = ToneMapping("/usr/lib/jellyfin-ffmpeg/ffmpeg")


def test_gpu_tone_mapping_decodes_scales_and_maps_on_the_igpu():
    args = build_ffmpeg_args(_spec(output=OutputFormat.H264_TS, max_height=1080, video_stream_index=0, hdr=True), tone_map=GPU)
    assert args[0] == "/usr/lib/jellyfin-ffmpeg/ffmpeg"
    assert args[args.index("-hwaccel") + 1] == "vaapi" and args.index("-hwaccel") < args.index("-i")
    assert "vaapi=va:/dev/dri/renderD128" in args
    graph = _graph(args)
    assert graph.startswith("[0:0]scale_vaapi=w=-2:h='min(1080,ih)':format=p010,hwmap=derive_device=opencl")
    assert "tonemap_opencl=" in graph and graph.endswith("hwdownload,format=nv12,format=yuv420p,setsar=1[v]")


def test_cpu_tone_mapping_is_capped_at_720p():
    graph = _graph(build_ffmpeg_args(_spec(output=OutputFormat.H264_TS, max_height=1080, hdr=True), tone_map=CPU))
    assert graph.startswith("[0:v:0]scale=-2:'min(720,ih)',tonemapx=")
    assert "-hwaccel" not in build_ffmpeg_args(_spec(hdr=True), tone_map=CPU)


def test_subtitles_go_on_after_tone_mapping():
    text = TextSubtitle(Path("/app/data/subtitles/a.ass"))
    gpu = _graph(build_ffmpeg_args(_spec(subtitle=text, start_seconds=60), tone_map=GPU))
    assert gpu.index("tonemap_opencl") < gpu.index("subtitles=")
    cpu = _graph(build_ffmpeg_args(_spec(subtitle=text, start_seconds=60), tone_map=CPU))
    assert cpu.index("tonemapx") < cpu.index("subtitles=")
    # Image subtitles are drawn at the source size: GPU maps at full size first; the CPU
    # overlays in 10-bit so tonemapx still sees the HDR signal.
    gpu_img = _graph(build_ffmpeg_args(_spec(video_stream_index=0, subtitle=ImageSubtitle(5)), tone_map=GPU))
    assert gpu_img.startswith("[0:0]hwmap=") and "[sdr][0:5]overlay,scale=" in gpu_img
    cpu_img = _graph(build_ffmpeg_args(_spec(video_stream_index=0, subtitle=ImageSubtitle(5)), tone_map=CPU))
    assert cpu_img.startswith("[0:0][0:5]overlay=format=yuv420p10,scale=-2:'min(720,ih)',tonemapx=")


def test_viewer_box_fits_keeping_aspect_and_never_upscales():
    graph = _graph(build_ffmpeg_args(_spec(output=OutputFormat.H264_TS, max_height=1000, max_width=1780)))
    assert "scale=w='min(1780,iw)':h='min(1000,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2" in graph
    gpu = _graph(build_ffmpeg_args(_spec(max_height=1000, max_width=1780, hdr=True), tone_map=GPU))
    assert "scale_vaapi=w='min(1780,iw)':h='min(1000,ih)':force_original_aspect_ratio=decrease" in gpu
    assert "force_divisible_by=2:format=p010,hwmap" in gpu


def test_output_size_caps_the_preset_to_the_viewer_box():
    from app.stream.ports import OutputFormat as F, Quality, StreamRequest, output_size

    assert output_size(F.H264_TS, StreamRequest("x", quality=Quality.HIGH)) == (None, 1080, 3000)
    assert output_size(F.H264_TS, StreamRequest("x", quality=Quality.HIGH, max_width=1780, max_height=1000)) == (1780, 1000, 3000)
    # A box bigger than the preset doesn't raise it.
    assert output_size(F.H264_TS, StreamRequest("x", quality=Quality.MEDIUM, max_width=2560, max_height=1440)) == (2560, 720, 1500)


def test_flow_controlled_stream_is_not_paced():
    # The client holds the stream back itself (stream.routes FlowControl): no -re, no burst.
    args = build_ffmpeg_args(_spec(output=OutputFormat.H264_TS, paced=False))
    assert "-re" not in args
    assert "-readrate_initial_burst" not in args


def test_youtube_passthrough_copies_h264_and_reencodes_only_the_separate_audio():
    args = build_ffmpeg_args(StreamSpec(
        input_url="https://v.example.com/video", audio_url="https://v.example.com/audio",
        output=OutputFormat.H264_TS, copy_video=True, start_seconds=90, paced=False,
    ))
    # Both inputs seek to the same point, neither is paced (flow control).
    assert args.count("-ss") == 2 and "-re" not in args
    assert args.index("https://v.example.com/audio") > args.index("https://v.example.com/video")
    assert "-filter_complex" not in args and "libx264" not in args
    assert args[args.index("-c:v") + 1] == "copy"
    assert _maps(args) == ["0:v:0", "1:a:0"]
    assert args[args.index("-ar") + 1] == "48000" and args[-1] == "pipe:1"


def test_separate_audio_input_is_mapped_when_transcoding():
    args = build_ffmpeg_args(StreamSpec(input_url="https://v.example.com/vp9", audio_url="https://v.example.com/opus", output=OutputFormat.JSMPEG_TS))
    assert "-filter_complex" in args and _maps(args) == ["[v]", "1:a:0"]


def test_test_pattern_needs_no_input_url():
    args = build_ffmpeg_args(StreamSpec(input_url=None, output=OutputFormat.H264_TS))
    assert "testsrc" in " ".join(args) and "sine" in " ".join(args)
    assert _maps(args) == ["[v]", "1:a:0"]


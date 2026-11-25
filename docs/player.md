# The car player: `<car-video>` + Media Chrome

The car player: a framework-free `<car-video>` media element under Media Chrome
controls. This page records why it's built this way and what it measured against the
earlier React player it replaced.

## Goals
1. **Lower car resource use.**
   - Decoded video frames are the big memory item: about 3 MB each at 1080p, and the
     earlier engine decoded the server's 2 s start burst at once, up to 90 frames.
     Keep compressed data queued instead, and decode at most ~0.5 s ahead.
   - No React on the player page: smaller bundle, no re-renders on the position
     ticker.
2. **A player element with the standard media API.**
   - `<car-video>` implements the HTMLMediaElement surface: `play()`, `pause()`,
     `currentTime`, `duration`, `paused`, `ended`, `volume`, `muted`, `seekable`,
     `buffered`, `readyState`, `error`, plus the standard events.
   - Any media UI can drive it. Seeking, track and quality changes reconnect the
     stream at the current position internally.
   - It knows nothing about Emby: the page hands it a `streamUrl(startSeconds)`
     function and a duration.
3. **Touch-first controls from Media Chrome** (MIT, web components, no framework):
   - big targets and auto-hide;
   - our own menus for subtitles, audio and quality, since our tracks switch by
     reconnecting, not through TextTrack.
4. **Measured before and after** (see Test plan), with no leak over long play or many
   seeks.

## Layout
- `src/player/` holds everything the open-source plugin will reuse. It's framework-free
  (no React, no Tailwind).
  - `engines/`: the WebCodecs and JSMpeg engines, `mpegts.ts`, `detect.ts`
    (moved here).
  - `car-video.ts`: the custom element. It owns the engine lifecycle, reconnects,
    the stall watchdog, the start timeout, the WebCodecs → JSMpeg fallback, and
    timeupdate at 4 Hz.
  - `page.ts` + `page.css`: the /car/play page. It covers the session and item
    fetch, Media Chrome controls, the title and back button, the menus, the "subtitle
    loading" chip, the error panel, the audio-unlock prompt, progress reports to Emby,
    and subtitle polling.
- `play.html` boots `page.ts`.

## Test plan
- **Unit (vitest):**
  - the decode-ahead gate;
  - the `<car-video>` state machine with a fake engine (play/pause/seek events,
    reconnect position, watchdog, fallback);
  - page helpers.
- **Playwright, real Emby, Chromium (the car is Chromium 148):** a perf script (not
  yet in this repo; it needs a test media server first) records, every few seconds:
  - PSS of the page's renderer process(es) + GPU process, from /proc;
  - JS heap (CDP Performance metrics);
  - CPU time per process type (CDP SystemInfo);
  - frames drawn, as a smoothness check.

  Scenarios:
  1. steady play, 20–30 min, 720p (default) and 1080p;
  2. 50 seeks in a row;
  3. bad network (toxiproxy: bandwidth, latency, jitter) and a cut-and-restore.

  Run once on the earlier player (baseline), once on `<car-video>`. Headless Chromium decodes
  in software, so absolute numbers differ from the car; trends and before/after
  ratios are the point.
- An end-to-end check of the hand-off flow (Play in Emby → the player → Back).

## Results (2026-10-03, headless Chromium in Docker, a feature film from a real Emby server)
Software H.264 decode, so most renderer memory is the decoder's own buffers; the car
decodes in hardware. "Renderer" = PSS of the page's renderer process.

| Scenario | Earlier React player (decode everything) | `<car-video>` |
|---|---|---|
| 720p steady (20 / 12 min) | renderer median 633 MB, p90 753, max 791; 17.2 frames/s drawn | median 640 MB, p90 645, **max 654**; **21.7 frames/s** |
| 1080p steady, 8 min | **froze after 49 frames, never recovered** | 19.7 frames/s, max 660 MB |
| 50 seeks | renderer median 724 MB, max 738 | median 491 MB, max 677 |
| bad network (4G → 3 Mbps + jitter → 1 Mbps → 15 s cut) | **stuck after the cut** | resumed at the same position seconds after the network returned |
| JS heap | 3–7 MB, flat | 3–5 MB, flat |

No run showed memory growing over time (trends flat or negative). Findings that
changed the code:
- **The compressed backlog grew without bound** when the decoder couldn't keep up
  (3087 chunks after 8 min at 1080p). The fix is catch-up: a backlog over 1 s old
  jumps to the newest due keyframe. Afterwards it held at ~30–50 chunks.
- **An outage turned into an error screen.** The reconnect after the stall failed
  while the network was down, and the player gave up. The fix:
  - a close without a server reason, or a hung connect, counts as `network`;
  - `<car-video>` retries every 2 s (8 s connect timeout per attempt), says it's
    reconnecting, and gives up only after 90 s;
  - a close *with* a reason (the server refused) still shows the error at once.
- The earlier player's 1080p freeze fits holding too many decoded frames (up to 90): decoders
  have a limited pool of output buffers. `<car-video>` holds at most 24 and decodes 0.5 s
  ahead. Hardware decoders in cars have even fewer buffers.

## Results: Jellyfin HLS (2026-10-06, `hls` engine, headless Chromium in Docker)
Jellyfin 12.2 in Docker on the same machine (software transcoding), Sintel (CC-BY, 2048×872
H.264 with B-frames) played twice in a row (30 min), 1280×720 window, so streams were
1280×545. Jellyfin's transcode and Chromium's software decoding shared one 8-core Intel N305.

| Scenario | Result |
|---|---|
| 720p steady, 25 min | renderer median 580 MB, max 669; JS heap 3 MB, flat; event listeners flat; no reconnects; 20.8 frames/s drawn (24 fps film, software decode under load) |
| 1080p level, 10 min | renderer median 486 MB, max 628; no reconnects |
| 50 seeks | one stream per seek (51 total); renderer median 516 MB, max 594; heap 3–6 MB |
| bad network (4G → 3 Mbps + jitter → 1 Mbps → 15 s cut) | no reconnects down to 3 Mbps; at 1 Mbps (below the stream's 1.6 Mbps) it keeps playing but draws ~13 frames/s; after the cut it resumed at the same position seconds after the network returned |
| Response times (end-to-end test) | first frame 1.7–3.8 s after Play; seek 0.8 s; quality switch 1.4 s; audio switch 0.6–1.5 s; subtitles on 1.2–1.5 s; resume after pause 0.4–0.6 s |

Findings that changed the code:
- **Segments filled the browser's HTTP cache** (Chromium's network process grew by ~50 MB);
  they're read once, so they're fetched `no-store`.
- **The wait loop piled up abort listeners** (one per 250 ms poll, held until the stream
  ended); `sleep()` now removes its listener.
- **Leaving left a transcode running** when a segment request was still in flight after
  the "stopped" report; the page now stops the stream first.

## A/V sync, pause and stats (2026-10-08)
Reported: picture and sound out of step after starting mid-film or resuming, settling
only after a while; and every resume reloaded from the network.
- Cause (sync): the picture followed `AudioContext.currentTime`, but sound is heard an
  output latency later — tens of ms on a desktop, possibly hundreds through car audio,
  and PulseAudio-style backends shrink it over the first seconds (hence "settles after
  a while"). Also, audio decoded before playback started was thrown away.
- Fix: the clock follows the sound being heard (`getOutputTimestamp()`); audio is kept
  until it can be scheduled; frames are drawn 20 ms early. Measured in headless
  Chromium (Jellyfin, 360p film, output latency 85 ms): picture minus sound median
  11–20 ms, max ≤ 35 ms at start, after 10 s, after resuming and after a seek. Under
  heavy CPU load (software decoding next to a 2K software transcode) the decoder falls
  behind instead; the stats panel says so, and a decoder reset now catches up.
- Pause keeps the stream and its buffer: play continues in ~0.2 s plus the tap, with no
  request (HLS) or reconnect (WebSocket, up to 60 s / 30 s buffered).
- Memory unchanged: 6 min steady, JS heap 2.6–4.7 MB, renderer ~570 MB, flat.

## Sound gone after a long pause (2026-11-24)
Reported from the car (YouTube via our server, WebCodecs): after a pause and play, about
a minute later the sound stops while the picture plays on; −60 s / +60 s brings it back.
- Cause: a pause over 60 s closes the WebSocket; play() continues from the buffer and
  splices a new stream on with 10 s left (the data watchdog does the same mid-drive).
  The new stream (copied H.264) has its picture from the keyframe before `t` and its
  sound from `t`, and was placed by its keyframe: its sound landed up to a GOP after the
  old sound ended. Chrome's `AudioDecoder` ignores input timestamps after the first one
  (until `flush`/`reset`) and stamps its output by counting on (measured in Chromium:
  a 3 s jump in the input → output stamped 3 s early), so all later sound came out
  stamped in the past and was dropped. `t` was also off by the first stream's preroll.
- Reproduced on the local rig (`aqz-KE-bpKQ`, pause 70 s): after the splice
  `audioScheduled` froze for the remaining 50 s while frames kept being drawn.
- Fix: the new stream starts where the received sound ends and its first sound is
  placed exactly there (`engines/splice.ts`); its picture takes over at its first
  keyframe after what the decoder already has. A jump in the sound input re-times the
  decoder with a non-awaited `flush()` (nothing decoded is lost; `audioJumps` in the
  stats). After the fix the same run had sound throughout, no input jumps.
- Tests: `splice.test.ts`, and `webcodecs-pipeline.test.ts` with a decoder that stamps
  like Chrome's (fails on the old splice).

## Emby without the server: its HLS vs our WebSocket stream (2026-10-08)

Same film (HEVC 1080p, PGS subtitles) from a real Emby 4.8, played through toxiproxy at
"Standard" quality, headless Chromium on an Intel iGPU (`--use-angle=gl-egl`; without a
GPU every `drawImage` is software and the numbers say nothing about a car). Seconds the
picture stood still per phase:

| Phase | Emby HLS, 9 s buffer | Emby HLS, 20 s buffer | + retry under buffer | Our stream (WebSocket) |
|---|---|---|---|---|
| normal 35 s | 0 | 0 | 0 | 0 |
| data stops 15 s, connection open | 1 + 2 after | 0 + 1 after | 0 | 0 |
| 1 Mbps + 200 ms jitter, 40 s | 0 | 0 | 0 | 0 |
| network cut 30 s | 27 | 25 | **6** | 3 |
| after the cut | 2 | 2 | 1 | 2 |

- The buffer is what rides out a dead zone, so the HLS engine now fetches up to 20 s
  ahead (`MAX_AHEAD_S`), like the WebSocket's flow control. 4–8 MB of compressed video.
- A failed segment used to end the engine after three tries, and the player's reconnect
  threw the whole buffer away (25 s frozen of a 30 s cut). Now network failures are
  retried for as long as more than 1 s is buffered (`KEEP_TRYING_S`); the buffer plays on.
- Main thread over the whole run: HLS 5.4 %, WebSocket 14.5 % (its unpaced refills); both
  ~6 % in steady playback, `drawImage` ~0.4 ms a frame. JS heap 3–4 MB either way.
- Emby picks the picture size from the bitrate: 1.5 Mbps gave 720×300 for a 2.39:1 film,
  3 Mbps 1280×533. Our server sized it to the window (1280×534) at 1.5 Mbps.
- Our server's scale filter left a 641:640 sample aspect ratio, so every frame was
  resampled to draw it; it now ends with `setsar=1`.

## Memory: our player vs `<video>` (2026-11-25)

Big Buck Bunny (CC-BY, Blender Foundation) encoded once: 1080p30 H.264 High with
B-frames, keyframe every 3 s, AAC 48 kHz stereo, 3.06 Mbps. The same bytes were played
three ways in headless Chromium (Playwright 1.63, Intel iGPU via `--use-angle=gl-egl`,
1920×1080 window), from a local server with no network shaping:

- **A, our player:** the real Jellyfin build (`hls` engine → WebCodecs → canvas) on
  the film as 3 s HLS segments, behind a stand-in for Jellyfin's item API.
- **B, `<video>` + hls.js 1.7.4 with its defaults** on the same playlist. Emby 4.8's and
  Jellyfin's web apps use hls.js the same way: Emby passes only timeouts, Jellyfin
  `maxBufferLength` 30 s, and neither limits the back buffer.
- **C, `<video src=film.mp4>`**, the same encode as a faststart MP4.

PSS of every Chromium process from `/proc/<pid>/smaps_rollup`. Short runs: 6.5 min
(playback, a seek forward to 7:30, a seek back to 1:40), twice each, interleaved.
Long runs: 20 min of steady playback (the film looped three times), once each.

| | A: our player | B: hls.js | C: MP4 |
|---|---|---|---|
| Total PSS at 5 min (two runs) | 737 / 770 MB | 891 / 892 MB | 447 / 387 MB |
| Total PSS, 10–20 min (mean) | **617 MB** | **869 MB** | 558 MB |
| Renderer PSS, 10–20 min | 420 MB | 577 MB | 217 MB |
| Renderer PSS, peak over all runs | 470 MB | 588 MB | 233 MB |
| Media held | 42 s compressed (20 ahead + 20 behind), ≈ 16 MB | ≈ 420 s (150 ahead + 270 behind), ≈ 162 MB | Chrome's media cache; `buffered` claims the whole film, but renderer memory stays flat |
| JS heap | 3–6 MB | 3–4 MB | 1–2 MB |

- Against hls.js our player uses about 250 MB less in total (−29%) and 160 MB less in
  the renderer. Chrome caps a SourceBuffer at about 150 MB of video, so hls.js stops
  growing there: the gap doesn't widen with a longer film.
- **A plain `<video>` playing an MP4 is lighter than ours:** its renderer is about half
  of ours. Ours holds up to 24 decoded frames (`MAX_QUEUED_FRAMES`, ≈ 3 MB each at
  1080p) and decodes in the page, which `<video>` doesn't need to.
- Our renderer grows for the first ~7 min (300 → ~470 MB), then stays flat (20-min
  run). That's allocator warm-up: ArrayBuffer backing stores (CDP
  `Runtime.getHeapUsage`) stayed between 0 and 17 MB.
- CPU (renderer + GPU process, software decode) came out similar for all three
  (≈ 30–35 % of one core when the machine was quiet). The NAS's own load varied
  during the runs, so these numbers aren't precise.
- Not the car: these runs decode in software (VA-API wouldn't engage in this headless
  build). In the car, `<video>` and WebCodecs both decode in hardware, so decoded frames
  sit in GPU memory instead. The buffers compared here (compressed data in the page vs
  MSE's SourceBuffer) are the same either way.

## Later
- Lower the quality by itself when the network can't carry the stream (1 Mbps above).
- Memory readings from the car itself.

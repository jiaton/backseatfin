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

## Later
- Lower the quality by itself when the network can't carry the stream (1 Mbps above).
- Memory readings from the car itself.

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

## Later
- HLS input mode: play the media server's own transcode (B-frame aware), for a
  backend-less Jellyfin plugin.
- Memory readings from the car itself.

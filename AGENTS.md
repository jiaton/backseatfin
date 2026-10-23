# BackseatFin

Watch your own Jellyfin or Emby library in a car's browser, including while driving,
where the car blocks `<video>` but not `<canvas>`. Built and tested on Tesla (Chromium
148 in the car).

1. **Jellyfin: a plugin, no server** (`jellyfin-plugin/`, GPLv3). It serves the player
   at `<jellyfin>/BackseatFin/` and adds `inject.js` to Jellyfin's web app. The player
   plays Jellyfin's own HLS transcode (engine `hls`). See "Jellyfin" below.
2. **Emby: the car host, no server** (the `frontend` image's nginx on `:8080`): Emby's
   own web app, except that its `index.html` also loads `inject.js`, which hands Play to
   our player. The player plays **Emby's own HLS transcode** exactly like Jellyfin's
   (`sources/mediaserver.ts`, engine `hls`): the two servers share this API. Emby has
   no plugin hook for web scripts, hence the nginx (`sub_filter`) instead of a plugin.
3. **The BackseatFin server** (`backend/`, compose profile `server`; Emby users can do
   without it):
   - **YouTube in the car** (`app/tube/`, the app's home screen): search, channels,
     playlists, followed channels' new uploads, history with resume, watch later — all
     local, no Google account. Play = the `youtube:<id>` stream: yt-dlp extracts
     YouTube's H.264 + AAC (bound to the server's IP, so the server relays it) and
     ffmpeg passes the H.264 through untouched (`StreamSpec.copy_video`, two inputs via
     `audio_url`), re-encoding only the sound to AAC 48 kHz. The player reorders the
     B-frames (`PlaybackSource.reorder`). See "YouTube in the car" below.
   - **HDR / Dolby Vision tone mapping** that works (Emby's often doesn't): the player's
     "Auto" transcoder sends HDR films here (`player/transcoder.ts`).
     ffmpeg re-encodes to H.264 + AAC in MPEG-TS, pushed over a WebSocket (engine
     **WebCodecs**), or MPEG-1/MP2 for **JSMpeg** where WebCodecs can't do H.264 + AAC.
   - **Settings** (`/settings` in the app): what you follow (unfollow), devices, language.
   - Removed in 0.2: YouTube → Emby downloads (live play made them redundant, and many
     users have no Emby) and the car test page (the player's own messages and stats
     panel cover it). `core/db.py` drops their tables (`REMOVED_TABLES`).

Self-hosted and single-household. Talks to YouTube (yt-dlp, its RSS feeds and image
hosts) and Emby (HTTP API, as the viewer or with the server key).

## Setup / Test / Run

Everything runs in Docker: `cp .env.example .env`, fill it in, `docker compose up -d`.
`docker compose build` builds the images locally instead of pulling them.

Backend (`backend/`):
- Install: `poetry install`
- Dev server: `API_KEY=dev DATABASE_PATH=/tmp/bsf.db EMBY_URL=http://<emby>:8096 poetry run uvicorn app.main:app --reload`
  (needs `ffmpeg` on PATH for streams; the image has it)
- Tests: `poetry run pytest -q`, or in the image:
  `docker run --rm --entrypoint python backseatfin-server -m pytest -q`
  (conftest forces its own `API_KEY` and DB)
- Export the API schema after any backend schema change:
  `API_KEY=x poetry run python -m app.scripts.export_openapi > ../frontend/openapi.json`

Frontend (`frontend/`):
- Install: `npm install`; dev: `npm run dev` (proxies `/api`, WebSocket included, to :8000)
- Regenerate API types after `openapi.json` changes: `npm run gen:api`
- Tests: `npm run test` (Vitest + RTL + MSW) · Lint: `npm run lint` · Build: `npm run build`

Jellyfin plugin (`jellyfin-plugin/`, .NET 10 SDK; Docker `mcr.microsoft.com/dotnet/sdk:10.0`
works): `cd frontend && npm run build:jellyfin` first (the DLL embeds `dist-jellyfin/`),
then `dotnet test BackseatFin.slnx` and `dotnet build -c Release Jellyfin.Plugin.BackseatFin`.
Try it in a throwaway `jellyfin/jellyfin` container: copy the DLL to
`/config/plugins/BackseatFin_0.1.0.0/` and restart.

CI (`.github/workflows/ci.yml`) runs the backend tests in the image, diffs the API
contract, runs the frontend's `check:api`, lint, tests and both builds, and tests and
builds the plugin. Tags `v*` (`release.yml`) publish `ghcr.io/<owner>/backseatfin-server`
and `-web`, the plugin zip on the GitHub release, and the plugin repository manifest on
GitHub Pages.

## Stack

- Backend: FastAPI · Python 3.12 · SQLModel over SQLite · Pydantic v2 · httpx · yt-dlp
  (+ Deno in the image for YouTube's JS challenges) · ffmpeg subprocesses · asyncio
  tasks for background work. Software decoding is enough for SDR: HEVC 1080p + PGS
  overlay → H.264 1080p runs at ~2.8× real time on an Intel N305.
- Frontend: Vite + React 19 + TS · shadcn/ui · Tailwind v4 · TanStack Query for the
  admin site. The player is framework-free (Media Chrome web components for controls).
  JSMpeg is vendored at `public/vendor/jsmpeg.min.js` (MIT). Two builds, both with
  `base: './'`:
  - `npm run build` (our server's image): `index.html` (admin SPA), `play.html` (car
    player, `player/main.ts`), and `src/inject/main.ts` → fixed-name `inject.js`.
    Relative asset URLs let the same files serve at the admin site's root and under
    `/car/` on the car host; `player/net.ts: API_PREFIX` picks `/car` from the page path.
  - `npm run build:jellyfin` (`vite.jellyfin.config.ts`, root `jellyfin/`) →
    `dist-jellyfin/`: `play.html` (`player/jellyfin-main.ts`), `car.html` (car-mode
    switch) and `inject.js`. The plugin embeds these files.
- The `frontend` image is nginx with two servers:
  - `:80`, the admin site (needs the server). It proxies `/api` (WebSocket upgrade on `/api/stream/ws`),
    resolving `backend` per request through Docker DNS, so a backend-only recreate
    recovers in ~10 s. `/assets/` is immutable; everything else is `no-cache`, so
    `inject.js` and the HTML pages update at once.
  - `:8080`, the car host (`templates/car-host.conf.template`, `EMBY_URL` filled in by
    the image's entrypoint). It serves Emby's `/web/` and `/web/index.html` with the
    script tag added (`sub_filter`, `Accept-Encoding` cleared), the player's static files
    at `/car/*` (prefix stripped), `/car/api/*` and `/car/health` to the optional server
    (resolved per request: no server = 502, and the player lets Emby transcode), and
    everything else to Emby.
- Users put both ports behind their own HTTPS reverse proxy (`docs/reverse-proxy.md`).
  WebCodecs needs a secure context.
- Jellyfin plugin: C# on .NET 10, built against `Jellyfin.Controller` 12.0.0 (loads on
  12.0+). `InjectStartupFilter` (registered by `PluginServiceRegistrator` as an
  `IStartupFilter`) rewrites `/web/` and `/web/index.html` responses to add the script tag
  (Jellyfin's web files are read-only in its image); `WebController` serves the embedded
  `dist-jellyfin` files at `/BackseatFin/{**path}` (`play` → play.html, `car` → car.html).
  `package.py` makes the release zip and the plugin repository `manifest.json` (GitHub
  Pages).

## Layering: domain folders + explicit ports (backend)

Domains: `auth/` (device cookies, pairing, Emby player sessions), `tube/` (YouTube
browsing, the local library, followed playlists, recommendations, the
`youtube` stream resolver), `emby/` (playback info, progress reports, and the `emby`
stream resolver), `stream/` (resolver dispatch + ffmpeg). Per domain: `routes.py` → `service.py` → `ports.py` (Protocol) ←
`adapter.py` (the only file importing yt_dlp, calling Emby over HTTP, or running
ffmpeg; `tube/` has two: `adapter.py` = yt-dlp, `web_adapter.py` = httpx for RSS feeds,
images and stream-URL checks). `tube/worker.py` holds the background loop; `tube/urls.py`,
`tube/formats.py`, `tube/cache.py` and `tube/recommend.py: pick` are pure. `auth/` has
no external
adapter of their own (DB session + in-memory stores); `auth/ports.py` declares the
Emby token check that `emby.adapter.EmbyHttpApi` implements. `auth/deps.py` holds every
auth dependency (`require_auth`, `require_player`, `require_ws_player`, `viewer_for`).

Streams: a request is `StreamRequest(source="<kind>:<id>" | "test", t, audio, sub)`.
`StreamService` looks up the resolver for `<kind>` (`resolvers={"emby": …, "youtube": …}` in the
container), gets a `ResolvedInput` (a `StreamSpec` plus temp files to delete), caps
concurrency, and cleans up after. A new source (e.g. `youtube:`) = one resolver,
nothing else.

`app/container.py` is the composition root: the one place concrete adapters are chosen
and cross-domain wiring happens. `app/core/` = config and DB only. Split files past ~250
lines.

## FE/BE type contract

`frontend/openapi.json` (committed) is exported from FastAPI; `src/lib/api/schema.d.ts`
is generated from it by `openapi-typescript`; `openapi-fetch` is the typed client.
Never hand-write API shapes. The frontend never calls Emby's API directly either:
Emby data comes through our typed `/api/emby/*`. Enforced in CI (contract diff) and in
the frontend image build (`check:api`).

## Data access

SQLModel only, no raw SQL. No migration tool: `create_all`; additive columns need an
`_ensure_column` helper. Losing the DB loses history, follows and device cookies (devices
re-pair). Pairings and player sessions are in memory
by design.

## Background work

- `tube/worker.py: FeedRefreshLoop`: every `FEED_REFRESH_INTERVAL_SECONDS` re-reads
  followed channels and playlists, then prunes the image cache.
- The container drops to `PUID:PGID` (`backend/entrypoint.sh`, default 1000:1000) after
  updating yt-dlp (`YTDLP_AUTO_UPDATE`).
- Streams: `-re` paced; the WS route closes the generator with `aclosing` so ffmpeg dies
  with the socket. Every URL input gets `-reconnect` (`_RECONNECT`): YouTube resets long
  connections, and without it a reset on the sound input left silent video playing on. Emby input = the original file via `/Videos/{id}/stream?static=true`
  with the token in `-headers`, never the URL. Audio and subtitle tracks are mapped by
  Emby's `MediaStream.Index` (= container stream index). Image subtitles (PGS/DVD) use
  `overlay`. Text/external subtitles are fetched as `.ass` from Emby and burned in with
  libass (glyphs from `fonts-noto-cjk` in the image; without it CJK subtitles render
  blank), with a `setpts` shift because input seeking restarts timestamps at 0.
- Emby extracts an *embedded* subtitle track by reading the whole file, which takes
  minutes on a multi-GB mkv. So `emby/subtitles.py: SubtitleCache` extracts in the
  background (10 min timeout) into `/app/data/subtitles/` (kept 60 days). A stream
  start waits ≤2 s for it; otherwise it plays without, the player polls
  `POST /api/emby/items/{id}/subtitles/{i}/prepare`, shows "Loading subtitles…", and
  reconnects once it's ready.

## YouTube in the car

- **API** (`/api/tube/*`, device cookie or API key; `routes.py` browsing,
  `library_routes.py` the household's own, `views.py` shared mapping): `home` (continue
  watching, followed playlists' shelves, followed channels' feed, recommended, watch
  later), `following`, `playlists/{id}/follow`, `search?q&kind=videos|channels|playlists`,
  `link?url` (a pasted link → kind + id), `videos/{id}` (+ `progress`), `channels/{id}`
  (+ `follow`), `playlists/{id}`, `later/{id}`, `history`, `image?u=` (thumbnails via
  the server; only YouTube's image hosts, `tube/urls.py: IMAGE_HOSTS`; cached on disk,
  newest 4000 kept).
- **Caching** (`tube/service.py`): search 10 min, channels/playlists 30 min, a video's
  details (and stream URLs) until 30 min before YouTube's `expire`. One load per key in
  flight. Opening a video page extracts it (~5 s), so Play starts in ~1.5 s; `home`
  prefetches the first "continue watching" video. Before each stream picture and sound are
  each checked with a 1-byte range request (~40 ms); when neither the HLS nor the file
  pair answers, the video is extracted again.
- **Format choice** (`tube/formats.py`, order in `service.py: _playable`): **HLS first**,
  the plain files (DASH `https`) only when HLS doesn't answer. HLS is short segment
  requests, so no hour-long connection for YouTube to cut, and on 2026-10-23 every file
  URL of one client answered 403 while HLS played; seeks start in ~1 s either way.
  Within a kind: the largest H.264 that fits the quality level and the window
  (portrait: short side vs height); sound AAC `140` (never `-drc`) for files, the
  highest HLS audio id (no codec name, `adapter.py: _acodec`) for HLS; no H.264 at all
  → the best other video, transcoded. Live streams: see below.
- **Following by link**: Settings → Following has a field for a playlist or channel
  link (`useFollowLink`: `/link`, then the follow call); a video link is refused.
- **Followed playlists** (`tube/playlists.py`): the way in from the phone without a
  Google sign-in. Public/unlisted only. Read with `fresh=True` (no cache) whenever home
  opens and the last read is older than `PLAYLIST_FRESH_S` (60 s; home waits ≤ 4 s for
  it), and by the loop. New items get `seen_at = now` (the home shelf is newest first);
  on the first read YouTube's order (oldest added first) is turned into seen times;
  videos taken out of the playlist are dropped.
- **Recommendations** (`tube/recommend.py`): channels watched ≥ 2 times but not
  followed (their newest; early on, the most recently watched channels fill in), followed channels most watched (videos 6–20: the newest are
  in the feed), the two most frequent searches made at least twice within 30 days (`SearchQuery`,
  last 50 kept; one-off searches are not interests). Round-robin
  (`pick`), nothing watched, saved or already on home, no live. Inputs are read from the
  request's session; the YouTube lookups run in a task, cached 30 min, invalidated by a
  follow or a first watch; the first ask waits ≤ 3 s.
- **Feed** (`tube/library.py`): followed channels are re-read every
  `FEED_REFRESH_INTERVAL_SECONDS` (and on follow). RSS gives dates but fails for
  minutes at a time (404/500): 3 tries, then the channel's video list (durations, no
  dates) so new videos still appear, ordered by when first seen; dates follow on a later
  refresh. 15 per channel, 60 days kept.
- **Resume**: the player reports progress every 10 s and on leaving (beacon); within
  30 s of the end counts as finished. Measured: ~1.5 s to first frame after Play on a
  prepared video, seeks 1–2 s, A/V within 30 ms, 15–20 s buffered; ffmpeg reads
  YouTube at ~2× real time (one long request).
- **Live streams**: their formats are HLS only (H.264 video-only + a sound HLS with no
  codec name, `adapter.py: _acodec`); `pick_stream(live=True)` takes those, the
  resolver always starts at the live edge, and no progress is recorded.
- **Captions** (`tube/captions.py`): `pick_tracks` offers uploaded tracks in the video's
  language and the app's (ordered), else YouTube's `-orig` automatic track; automatic
  translations (`tlang`) are left out (YouTube answers servers 429). The server fetches
  json3 only from `www.youtube.com/api/timedtext` (`urls.py: is_youtube_caption`),
  `parse_json3` → cues, cached an hour; `GET /videos/{id}/captions/{track}`. The player
  draws them (`player/captions.ts`, `PlaybackSource.captions`): choosing a track never
  reconnects the stream; the language is remembered (`backseatfin:captions`).
- **Play-through**: video and player URLs carry `list` (`playlist:<id>` in YouTube's
  order, `shelf:<id>` = a followed playlist's home row, newest first, or `later`). At the
  end the player asks `GET /next?list&after` and shows "Up next" (`player/up-next.ts`,
  8 s); the next video's back goes to its page with the same list. A video of the list
  that fails (load error or stream error) offers "Play the next one" (`offerNext`): a
  button, never an automatic skip (owner's choice). Playlist entries with no title
  (videos YouTube hides as unavailable) are dropped in `adapter.py: _is_video`.
- Frontend: `features/tube/` (`api/` hooks + `keys.ts`, `components/`, `lib/` with its
  own five-language string table `strings.ts` and `format.ts`), screens
  `tube-*-screen.tsx`. A card clicked in a list seeds its video page (`tubeKeys.card`)
  so the page draws at once while the details load.

## Emby and Jellyfin without a server

- **Which browsers:** the plugin setting `CarHostnames`. Set → only requests for those
  hosts get the script tag (like Emby's car host). Empty → every page gets it with
  `data-mode="opt-in"`, and `inject.js` only acts where `localStorage['backseatfin:car']
  === '1'`, which `/BackseatFin/car` switches. Never on by default anywhere else: phones
  and computers keep Jellyfin's own player.
- **Hand-off:** the same `inject.js` as Emby (the two web apps share their ancestry:
  `ApiClient`, `video.htmlvideoplayer`, `/Videos/{id}/…` URLs). Jellyfin's routes are
  `#/video`/`#/queue`; its own HLS player writes item ids as dashed GUIDs. `inject.js`
  finds the player next to itself (`new URL('play', import.meta.url)`).
- **Player:** `sources/mediaserver.ts` calls the server's API from the browser with the
  viewer's session (inject.js leaves `{token, userId}` in sessionStorage; else the web
  app's `jellyfin_credentials` / `servercredentials3`), as its own device
  (`backseatfin:device`, so stopping our transcodes never touches the web app's). Emby
  and Jellyfin differ only in that storage key: same `Authorization: MediaBrowser …`
  header, `/Users/{user}/Items/{id}`, HLS parameters, `ActiveEncodings` and
  `/Sessions/Playing`. The server checks every request itself; nothing of ours sees the
  token. Emby 4.8 at 1.5 Mbps sends 1280×532 H.264 Main with B-frames; a first segment
  mid-film with PGS burned in took ~4.4 s, then ~0.4 s each.
  - Stream = `/Videos/{id}/master.m3u8` with `VideoCodec=h264`, `AudioCodec=aac`,
    `MaxAudioChannels=2`, `SegmentContainer=ts`, the level's bitrate, `MaxWidth`/`MaxHeight`
    = the level's box capped to the screen, and `SubtitleMethod=Encode` (burned in).
  - **Quality levels are sizes** (`quality.ts`, `PlaybackSource.levels`). Both servers pick
    the picture *width* from the bitrate (an explicit `Width` is ignored), with different
    tiers: Emby 4.8 gives 720 wide under 3 Mbps, 1280 from 3, 1920 from 4; Jellyfin 12
    gives 960 under 1.5, 1280 from 1.5, 1920 from 2.5. So `MEDIA_SERVER_LEVELS` asks each
    for the bitrate that buys the level's width (Emby "Standard" = 3 Mbps). The settings
    sheet shows each level's real size in this window, bitrate and GB per hour.
    Jellyfin refuses `StartTimeTicks` on segments: the playlist covers the whole film, and
    the `hls` engine starts at the segment holding the position (`#t=` on the URL).
  - One `PlaySessionId` per choice of tracks/quality/size: seeks reuse it (Jellyfin
    restarts its encoder at the requested segment); a new choice gets a new one, and the
    old transcode is stopped (`DELETE /Videos/ActiveEncodings`). Leaving stops it too:
    the page pauses (aborting fetches) *before* reporting, or an in-flight segment
    request would restart the encoder.
  - Progress: `/Sessions/Playing` (+ `/Progress`, `/Stopped`) in ticks, `keepalive`
    when leaving.
  - No JSMpeg fallback without the server (nothing to transcode MPEG-1): without
    WebCodecs the page says so.
- **Who transcodes** (`player/start.ts`, Emby only): the page probes `health` next to
  itself (the car host's `/car/health`). With the server there, `transcoder.ts` picks:
  `auto` (default) = the server for HDR items (`VideoRange` ≠ SDR) or without WebCodecs,
  Emby otherwise; `server` / `backseatfin` force one (localStorage
  `backseatfin:transcoder`). The settings sheet offers the choice only when the server
  answers; switching reloads the page at the current position with the same tracks.
- **`hls` engine** (`engines/hls-engine.ts` + `hls.ts`): master → first variant → media
  playlist (cached per URL, so a seek costs one segment request); segments fetched one
  at a time and streamed into the demuxer, at most `MAX_AHEAD_S` (20 s, like the WebSocket's flow control) ahead of the clock.
  A failed segment is retried in place only before any of its bytes arrived and only
  for transient errors; otherwise the player reconnects in place (`network`) or shows
  the error (`connection`, e.g. 401, 500).

## The Emby car host hand-off (how the car plays Emby)

1. The car host serves Emby's `index.html` with
   `<script type="module" src="/car/inject.js">` added. Nothing else about Emby
   changes, and Emby's other addresses and apps are untouched.
2. `inject.js` patches the `src` setter / `setAttribute` of **`video.htmlvideoplayer`
   only** (Emby's main player; theme/backdrop videos never trigger), plus XHR/fetch for
   HLS while that element exists.
   - The first playback URL gives the item, the start (`#t=` or `StartTimeTicks`), and
     Emby's chosen `AudioStreamIndex`/`SubtitleStreamIndex`.
   - It stores `{token, userId}` from Emby's global `ApiClient` in sessionStorage and
     opens `/car/play?item&t&audio&sub&back&embed=1` as a **full-screen iframe layer
     over Emby's page**, then steps Emby back out of its own (empty) player route with
     `history.back()`.
   - The player's Back posts `backseatfin:close` to the parent, which removes the layer,
     so Emby is exactly where it was and never reloads.
   - Emby's own HLS playlist request is held (opened but never sent; fetch never
     resolves) until Emby aborts it. That keeps Emby from starting a server-side
     transcode per hand-off. Answering it with an empty playlist made Emby's player
     throw instead.
   - If `ApiClient` has no session, playback is left alone.
   - **Hosted player** (docs/emby.md "no files at all"): inject.js loaded from GitHub
     Pages (`site/emby/`, published by release.yml) finds the player next to itself on
     another origin. Then the layer URL carries `server=<Emby origin>` (an origin only,
     `params.ts: serverOrigin`), the session never goes into sessionStorage or a URL: the
     player posts `backseatfin:ready` to the parent (that origin only) and inject.js
     answers `backseatfin:session` to the player's origin only (`player/hosted.ts`), and
     the player calls Emby at that origin (`HostedServer`; Emby allows CORS, also for
     keepalive requests). No BackseatFin server in that mode. Chrome's Private Network
     Access blocks Pages → a private address ("Permission was denied for this
     request"), so the Emby hostname must resolve publicly; the e2e uses the real
     tv host with `INJECT_SRC` rewriting the script tag (emby-hls-check.mjs).
   - A playback already handed off (same `PlaySessionId`) never opens the player again:
     the web app's player can outlive our layer and retry its held request seconds later.
3. With the server transcoding (`sources/backseatfin.ts`), `play.html` POSTs the token
   to `/api/auth/player-session` (token only in the body).
   Emby verifies it (`GET /Users/{id}` with it), and the page gets `bsf_player`
   (HttpOnly, 12 h sliding, in memory). That cookie authorizes the stream WS and
   `/api/emby/*` only, never admin routes.
4. **The player page** lives in `frontend/src/player/` (design and measurements:
   `docs/player.md`). It's framework-free (no React or Tailwind), because it runs in
   the car for hours and will also ship as a standalone plugin.
   - **Shape:** an entry (`player/main.ts` for Emby, `player/jellyfin-main.ts`, both via
     `start.ts`) builds a `PlaybackSource` (`source.ts`: the item, its
     tracks, `streamUrl()`, `headers()`, `report()`, optional `prepareSubtitle()`) and
     hands it to `page.ts: mountPlayer`, which puts `<car-video>` under Media Chrome
     controls. Nothing in `page.ts` knows which server it is. ~45 KB gz of JS + CSS.
   - **`<car-video>`** (`car-video.ts`) is a media element: `play()`, `pause()`,
     `currentTime`, `duration`, `paused`, `ended`, `volume`, `muted`, `seekable`,
     `readyState`, `error`, plus the standard events, so any media UI can drive it.
     - It knows nothing about Emby: the page gives it `source = {url(start, engine),
       duration, start}`.
     - Pause, seek, quality and track changes all reconnect with new params (the page
       calls `reload()` after changing what `url()` encodes).
     - Seeks while playing settle for `SEEK_SETTLE_MS` (300 ms) first, so dragging the
       bar or tapping +30 s three times opens one server stream.
     - A seek forward that lands inside what's already received (a "+10 s" tap) needs
       no stream at all: the engine's `skipTo` (`webcodecs-pipeline.ts: jumpTo`)
       restarts decoding at the last keyframe at or before the target, drops what comes
       out before it, and holds the clock and sound until the target's picture is ready:
       it lands exactly. Both decoders are reset (Chrome's AAC decoder otherwise stamps
       its output by counting on from the skipped input, and everything was dropped as
       past). It only uses the buffer that's there anyway (kept compressed), so it
       costs no memory; it refuses when less than `SKIP_MIN_LEFT_S` (2 s) would be
       left, backwards, or while paused.
     - A stream started mid-film (copied H.264) has its picture from the keyframe
       before `t` and its sound from `t` exactly. The pipeline waits for the first
       sound before starting the clock and skips the picture before it (`jumpTo`,
       ≤ `MAX_PREROLL_S`), so playback starts at `t` with sound. Before, the car
       showed up to a few seconds of earlier picture in silence, with the time display
       ahead by that much.
     - **Waiting for data** (`REBUFFER_S`): when the clock passes the newest frame
       received (the network slower than the stream), the pipeline stops the clock like
       a pause and goes on once 2 s are buffered again; `<car-video>` reports
       `buffering` with 'waiting'/'playing' and the loading box shows. Before, the clock
       ran on: every frame that trickled in was late (7 fps in the car, 2026-10-23), the
       sound was dropped as past, and the stats blamed the decoder (`diagnose.ts` now
       checks an empty buffer first). Data still arriving keeps the stall watchdog quiet.
     - **Quality advice** (`quality-advisor.ts`, a button, never a switch by itself,
       like "play next"): two waits for data within 90 s, or one of 5 s, offers the
       highest lower level that fits 80% of the measured link; after taking it, "back
       to …" is offered once the link carries the next level ×1.5 in 3 measurements
       with no wait for 2 min, never above the level before. Not saved as the viewer's
       choice; a manual pick resets it. The link rate (`networkKbps`) is measured by
       the inputs while actually fetching: whole HLS segments, or ≥ 4 s stretches the
       WebSocket isn't held.
     - Known: "hold" lags the socket buffers on the way, so the WebSocket buffer can
       reach 30–70 s instead of 20 s (a few MB compressed). Fix would be byte acks.
     - The start lead counts as met when the decoded-frame cap is full: at 60 fps the
       24-frame cap holds 0.4 s < `START_LEAD_S`, so every start used to wait out
       `START_MAX_WAIT_MS` (1.5 s).
     - 4 s with no new frame means the end (within 10 s of the runtime) or a dropped
       connection, which resumes in place. 20 s without a first frame is an error.
     - **Loading box** (`player/loading.ts`): while waiting for a picture (start, seek,
     rebuffer, reconnect) the page shows what it's doing and for how long (server
     preparing / receiving / buffering / reconnecting, from bytes and frames so far), the
     speed against what the level needs, data and buffer, the HLS segment wait, quality
     and position; refreshed every 0.5 s. Replaces the one-line "Loading…".
   - **Pause holds the stream** (engines with `pause()`/`resume()`: WebCodecs, HLS):
       the clock freezes and everything buffered stays, so play() continues at once with
       no new request. Seeking, a new choice (`reload()`) or leaving (`stop()`) let a held
       stream go.
     - **Our server's stream (WebCodecs) is one long WebSocket, kept healthy by the
       client** (`webcodecs-engine.ts`):
       - Flow control (`flow=1`): the server sends unpaced (no `-re`) and the client says
         `hold` above 20 s buffered and `go` below 15 s (text frames; the server stops
         reading ffmpeg, whose pipe then fills and it waits). JSMpeg stays paced.
       - Data watchdog: no bytes for 5 s while expecting some (not held) = stuck (mobile
         networks hang without closing). The socket is dropped and a new one opened
         **spliced** onto the buffer: it starts (`t`) where the buffer ends and its first
         keyframe is placed there (`pipeline.spliceAt`), so playback doesn't stop.
         Retried every 2 s; if the buffer runs out first, car-video's stall/outage
         handling takes over.
       - Paused: the stream is kept (held) for 60 s, then closed to free ffmpeg; play()
         continues from the buffer and splices a new stream on with 10 s left.
       - A clean close (1000) after data = the server finished the film: nothing retried.
       - Tested through toxiproxy: 15 s of a hung connection, 40 s at 1 Mbps, a 30 s cut —
         no second without progress.
     - HLS (Jellyfin) is segments of 3 s, up to 9 s ahead; a segment with no bytes for
       5 s (15 s before its first byte) is aborted and fetched again, skipping the bytes
       already pushed (segments are files on the server, the same bytes each time).
     - Network outages are not errors. A close without a server reason, or a hung
       connect (8 s per attempt), retries every 2 s at the same position and says it's
       reconnecting. It only gives up after 90 s. A close *with* a reason (the server
       refused) shows the error at once.
     - A WebCodecs *decode* error falls back to JSMpeg once, on a fresh canvas (a
       canvas can't switch from 2D to WebGL). `stats()` returns the engine's counters
       for tests.
   - **Media Chrome** (MIT, web components, `media-chrome/dist/...` imports):
     - It provides the controller, play button, time range and time display. We
       provide the back button and title (top), −15/+30 s (centre), and a settings sheet
       with big option buttons for quality, audio, subtitles and language (its own
       menus are desktop-sized).
     - `gesturesdisabled`: a tap never toggles play.
     - Touch taps show and hide the controls (3 s autohide). Hidden controls are
       opacity 0 in Media Chrome, so CSS turns their pointer events off. A tap that
       wakes the controls swallows its trailing click, which would otherwise hit the
       play button that just appeared under the finger.
   - **Language** (`player/i18n.ts`; the admin site shares its saved choice): English,
     Chinese, Spanish, Japanese and Korean. It defaults to the browser's language (else
     English); the switch applies in place and is remembered in localStorage. Media
     Chrome has labels for en/zh/es only; ja/ko fall back to English there (aria labels). Engines
     and `<car-video>` report technical English detail plus a reason
     (`decode`/`refused`/`timeout`/`outage`, with the WS close code), and the page
     words it. Server close reasons and subtitle errors are English.
   - **Engines** (`player/engines/`, one `StreamEngine` interface): `pickEngine()`
     chooses `webcodecs` when `VideoDecoder` supports `avc1.640028` and `AudioDecoder`
     supports AAC-LC, else `jsmpeg`; `?engine=` forces one. `webcodecs` (our server's
     WebSocket) and `hls` (a media server's HLS) are inputs to one decode pipeline,
     `webcodecs-pipeline.ts`.
   - **WebCodecs pipeline:**
     - The stream is `format=h264ts`: H.264 High 4:2:0, no B-frames, 2 s GOP, AAC-LC
       48 kHz, MPEG-TS, with `-readrate_initial_burst 2` so the client starts with a
       buffer.
     - `engines/mpegts.ts` demuxes it (PAT/PMT/PES/PTS; ADTS → raw AAC + ASC). It's
       tested against the real ffmpeg fixture `engines/__fixtures__/tiny.mpegts`, named
       `.mpegts` because `.ts` would be compiled as TypeScript.
     - The decoder is configured from the first keyframe's SPS (`annexb.ts:
       avcCodecString`). B-frames (media servers' HLS): compressed frames wait in decode
       order and are fed by DTS; frames come out and are drawn by PTS. `optimizeForLatency`
       only without B-frames.
     - **Decoding is gated:** received video waits *compressed* and is decoded only
       `DECODE_AHEAD_S` (0.5 s) ahead of the clock, with at most 24 decoded frames
       (~3 MB each at 1080p; car decoders have few output buffers). Uses
       `optimizeForLatency`. A backlog more than 1 s behind the clock jumps to the
       newest due keyframe, so a slow decoder can't build an unbounded queue.
     - **Clock = the sound being heard**: once the shared AudioContext runs, media time
       follows `heardTime()` (`getOutputTimestamp()`: the context time at the speakers,
       i.e. `currentTime` minus the output latency, which can be hundreds of ms through
       car audio and changes while playing). Following `currentTime` instead put the
       picture ahead of the sound by that latency. Before sound is unlocked it's the wall
       clock (re-anchored on switching). Sound starts `AUDIO_START_LEAD_S` after the
       anchor, so the first buffers are on time; frames are drawn `PRESENT_LEAD_S` early
       (they show on the next refresh). Measured offset: median 11–20 ms, ≤ 35 ms.
     - Audio waits compressed too, is decoded 1.5 s ahead and handed to WebAudio 0.5 s
       ahead; what WebAudio hasn't played yet is taken back on pause/re-anchor and
       rescheduled. Playback waits for 0.5 s of buffer (max 1.5 s) before starting, and
       audio goes through a per-stream GainNode, so destroy() silences it at once.
     - Far behind (picture > 1.5 s behind the clock with a decoder backlog): the decoder
       is reset and restarts at the newest keyframe.
   - **Stats for nerds** (`page.ts` + `diagnose.ts`; toggle in the settings sheet's
     quality section, remembered): a panel over the picture, updated twice a second,
     with one sentence on how playback is going or why it stutters (network: data
     arriving slower than real time with a low buffer; server: HLS segments slow to
     start; decoder: picture behind the clock), then engine/codec/size/fps, receive rate
     vs the stream's own bitrate, buffer, last HLS segment's server wait and load time,
     decoder latency/queue/late/skipped/resets, picture-vs-sound offset, output latency.
   - **Quality presets** (`stream.ports.Quality`, mirrored in `player/quality.ts`,
     remembered per browser in localStorage), per codec:

     | Codec | low | medium (default) | high | max |
     |---|---|---|---|---|
     | H.264 | 480p/800k | 720p/1500k | 1080p/3000k | 1080p/6000k |
     | MPEG-1 | 480p/1000k | 720p/2000k | 720p/3500k | 1080p/5000k |

     Output keeps the source frame rate, snapped to a legal MPEG-1 rate.
     **Capped to the screen:** the player sends its display box in device pixels
     (`maxw`/`maxh` on the stream WS). `output_size()` caps the preset height, and
     ffmpeg fits the box at the source aspect ratio, never upscaling (2.39:1 films are
     width-limited). The bitrate stays, so a capped stream gets more bits per pixel.
     The settings sheet tells the viewer the window's maximum, what's playing now, and
     each level's real output size: above the window size a higher level only adds
     bitrate.
5. Progress goes to Emby as the viewer (start / every 10 s / pause / stopped, and
   `sendBeacon` when leaving), so resume points and "watched" match other clients.

## HDR and Dolby Vision

Untreated, HDR10 plays washed out and Dolby Vision profile 5 plays purple/green: P5 has
no HDR10 base layer and needs DV's reshaping metadata, which Debian's ffmpeg can't
apply.

- HDR streams (`StreamSpec.hdr`, from Emby's `VideoRange` ≠ `SDR`) use
  **jellyfin-ffmpeg** (`/usr/lib/jellyfin-ffmpeg`), whose tone mappers do the DV
  reshaping. Everything else, including yt-dlp, keeps Debian's ffmpeg.
- **GPU first** (Intel only so far): VAAPI decode, then `scale_vaapi`, then OpenCL
  `tonemap_opencl`. Needs `/dev/dri` plus the host's video/render groups
  (`docker-compose.intel.yml`).
- **CPU fallback**: `tonemapx`, capped at 720p, used when there's no GPU, when the GPU
  attempt produces nothing, and then for `GPU_COOLDOWN_S` (10 min). With no
  jellyfin-ffmpeg (e.g. a dev machine), HDR plays untouched.
- Subtitles are drawn after tone mapping. PGS is overlaid at the source resolution (the
  GPU path tone-maps full-size first; the CPU path overlays in 10-bit), so its canvas
  still lines up.
- Measured on an Intel N305, 4K source to H.264, multiples of real time:

  | Path | 720p | 1080p |
  |---|---|---|
  | GPU | 3.2–3.5× | 1.9–2.4× |
  | GPU, two streams at once | — | ~1.17× each |
  | CPU | 1.6× | 0.9–1.2× (too slow, hence the cap) |

- Intel's OpenCL runtime isn't in Debian trixie. It comes from Intel's GitHub releases
  (the versions Jellyfin's own image ships), checksum-pinned in the Dockerfile. To bump
  it, take the versions from a newer `jellyfin/jellyfin` image (`dpkg -l | grep intel`)
  together with the published sha256s.
- Kernels compile on first use (~4 s). `NEO_CACHE_DIR` on the data volume makes that a
  one-off.

## Auth & security

Credentials:
- **Setup code** (`auth/setup_codes.py`, table `SetupCode`, one row, SHA-256 only): 6
  digits, one use, burnt after 5 wrong tries. Issued at startup when no device is
  signed in (24 h, printed to the log: the one credential that is ever logged) and by
  `backseatfin-code` in the image (`app/scripts/setup_code.py`, 15 min; runs as
  PUID:PGID so the DB keeps its owner). Server and command share it through the DB.
  `POST /api/auth/login {key}` takes a setup code or the API key.
- `X-API-Key` header: scripts and curl. `API_KEY` is optional (empty = no key
  accepted). Browsers never store the key.
- `bsf_device` cookie (HttpOnly, Lax, Secure behind https, 400 days, SHA-256 in DB),
  minted by a code/key login or TV-style pairing (6-digit code + QR, approved from a
  signed-in phone; the car polls with a 128-bit pairing id and gets the cookie once).
- `bsf_player` cookie: the car player only, see the hand-off above.

**fail2ban contract:** 401/403 only for a *presented* wrong credential (bad key,
revoked/unknown cookie, rejected Emby token, unauthenticated WS).
`GET /api/auth/session` is always 200; a wrong pairing code from a signed-in phone is
404; the frontend never retries 4xx. So users can ban on repeated 401/403 in their
reverse proxy's log (`docs/reverse-proxy.md`) without the car banning itself. Keep
all of this true.

Logs: the backend never logs tokens. ffmpeg gets the Emby token only via `-headers`.
yt-dlp runs without YouTube cookies by design.

## Frontend rules

Structure: `components/ui/` (shadcn primitives + `QueryState`, `QrCode`,
`NativeSelect`) · `features/<name>/{api,components,hooks,lib,types}` (no cross-feature
imports) · `screens/` compose features · `lib/` shared (API client, `QueryClient`
factory with the global 401 → re-check-session hook, admin i18n) · `player/` the car
player (framework-free; nothing in it imports React). `src/inject/` is separate.
Nothing outside it may import from it, and it imports only `./parse`, so `inject.js`
bundles as one standalone file. Otherwise Rollup splits a shared chunk; `npm run build`
fails via `scripts/check-inject.mjs`. Shared constants are copied, with a test
asserting the copies match (`CLOSE_MESSAGE`). Hook files are `use-kebab-case.ts`.
Routing: `lib/router.ts` (pushState + `useLocation`, no router dependency) and a path
switch in `App.tsx`: `/` home, `/search`, `/v/<id>`, `/c/<id>`, `/p/<id>`, `/settings`,
`/pair`. In-app links are `components/ui/link.tsx` (a real `<a>`). The player is
its own page (`play.html`, `/play?yt=<id>&t=&back=`), so its back returns by history
when it came from `back` (page restored from the back/forward cache, which `main.tsx`
refetches) and by `location.replace` otherwise. `index.html` has `<base href="/">`:
assets are built with relative URLs (the player also serves under `/car/`), and deep
routes would otherwise resolve them under `/v/`. The app is always dark (car).
Client state: React state + the URL only (no store library).

Styling: colors only from tokens in `src/index.css` (the player's in
`player/page.css`). `npm run lint` enforces it (stylelint `color-no-hex` +
`scripts/check-tokens.mjs`). Car-facing screens use big touch targets (≥ 56 px in the
player) and native `<select>` pickers.

UI text: every user-visible string goes through i18n (`player/i18n.ts` for the
player; `lib/i18n.ts` + `useT()` from `components/i18n.tsx` for the admin site),
English first, then Chinese. A test checks the Chinese table has every key.

## Testing

- Backend `pytest`: services against fake ports (`TubeSourcePort`/`TubeWebPort`,
  `EmbyApiPort`, transcoder); dropping removed tables; ffmpeg argument
  building (headers, track maps, both subtitle kinds, unsafe paths, HDR paths, the
  viewer box); stream temp-file cleanup; auth/pairing/player-session API flows via
  TestClient. Mock the port, never the service.
- Frontend `vitest`: server-state hooks through MSW, auth gate flows, `QueryState`/
  `QrCode` renders, i18n, pure helpers (`inject/parse`, `player/params`, `player/net`,
  `player/quality`), the TS demuxer, and the `<car-video>` state machine with a fake
  engine (`player/car-video.test.ts`: seek coalescing, stall resume, end, fallback,
  start timeout, outage retry, stale callbacks).
- Tube: strings complete in all languages, formatting, hooks through MSW (home,
  follow → refetch, search gating, YouTube's error reason), `VideoCard`, the router,
  `readTubeParams` (no open redirect). Backend: link parsing, the image-host allowlist
  (no SSRF), format choice, the TTL cache, the resolver (pass-through spec, dead URL →
  re-extract, live from the edge, bad id refused), captions (track choice, json3), the library (follow → feed, RSS failure → channel
  list fallback, resume threshold), followed playlists (newest first, removed items go,
  only stale ones re-read), recommendations (turns, exclusions), home with something
  to continue (regression: 500), ffmpeg pass-through args.
- End to end against real YouTube (Playwright, `--use-angle=gl-egl` on the iGPU; not in
  CI): sign in → search → video → channel → follow → play (frames, sound clock) → seek →
  back → resume offered → home rows → pasted link.
- Media server source (`sources/mediaserver.test.ts`): credentials, device id, the HLS
  query, one transcode per choice and stopping the old one, progress reports.
- Plugin (`jellyfin-plugin/…Tests`, xunit): which hosts get which script tag, the web
  index match, idempotent injection.
- End to end against a real Jellyfin (Playwright; not in CI yet): Play → layer → frames
  → seek, quality, audio, subtitles, pause/resume → Back → resume point saved, no
  transcode left running.
- A bug fix comes with a regression test.

## Forbidden

- Business logic in `routes.py`; a service importing yt_dlp/httpx/subprocess directly.
- Hand-written FE types for API shapes; the frontend calling Emby's API directly.
- Raw hex / Tailwind palette colors outside the token files.
- Hard-coded UI strings outside the i18n tables.
- A long blocking call (yt-dlp) on the event loop: `asyncio.to_thread`. And a sync
  route (run in a thread) must not start event-loop tasks: make it `async`.
- YouTube cookies anywhere in this repo or its env.
- Any credential (API key, device/player cookie, Emby token) in a URL, browser storage
  beyond the tab-scoped hand-off, or a log line (the one exception: the first start's
  one-time setup code).
- A 401/403 for "not signed in yet" (see the fail2ban contract).
- Gating car-only behaviour on the User-Agent (the car's UA has no "Tesla" token).
- Imports in `src/inject/` beyond `./parse` (it must build to one standalone file).
- The Jellyfin plugin acting in a browser nobody chose (car hostname or car mode).
- Unbounded ffmpeg: every stream goes through `StreamService`'s slot cap.
- Personal hostnames, addresses, paths or IDs in code, docs or tests: use
  `example.com` names and `.env` settings.

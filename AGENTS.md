# BackseatFin

Watch your own Emby library in a car's browser, including while driving, where the car
blocks `<video>` but not `<canvas>`. Built and tested on Tesla (Chromium 148 in the car).

1. **The car host** (Emby + the car player): Emby's own web app, except that its
   `index.html` also loads `inject.js`, which hands Play to our player. The player draws
   on a `<canvas>`. The default engine is **WebCodecs**: ffmpeg re-encodes to H.264 + AAC
   in MPEG-TS, pushed over a WebSocket, demuxed in the browser, video decoded by the
   car's hardware decoder and audio played through WebAudio. **JSMpeg** (MPEG-1/MP2
   decoded in WebAssembly) is the fallback where WebCodecs can't do H.264 + AAC.
2. **YouTube → Emby** (optional): poll YouTube playlists and download new videos into an
   Emby "TV shows" library, one channel per show.
3. **The admin site**: playlists, download queue, devices, the car test page.

Self-hosted and single-household. Talks to YouTube (yt-dlp), Emby (HTTP API, as the
viewer or with the server key) and the folder that Emby also indexes.

## Setup / Test / Run

Everything runs in Docker: `cp .env.example .env`, fill it in, `docker compose up -d`.
`docker compose build` builds the images locally instead of pulling them.

Backend (`backend/`):
- Install: `poetry install`
- Dev server: `API_KEY=dev DATABASE_PATH=/tmp/bsf.db EMBY_URL=http://<emby>:8096 poetry run uvicorn app.main:app --reload`
  (needs `ffmpeg` on PATH for downloads and streams; the image has it)
- Tests: `poetry run pytest -q`, or in the image:
  `docker run --rm --entrypoint python backseatfin-server -m pytest -q`
  (conftest forces its own `API_KEY` and DB)
- Export the API schema after any backend schema change:
  `API_KEY=x poetry run python -m app.scripts.export_openapi > ../frontend/openapi.json`

Frontend (`frontend/`):
- Install: `npm install`; dev: `npm run dev` (proxies `/api`, WebSocket included, to :8000)
- Regenerate API types after `openapi.json` changes: `npm run gen:api`
- Tests: `npm run test` (Vitest + RTL + MSW) · Lint: `npm run lint` · Build: `npm run build`

CI (`.github/workflows/ci.yml`) runs the backend tests in the image, diffs the API
contract, and runs the frontend's `check:api`, lint, tests and build. Tags `v*` publish
`ghcr.io/<owner>/backseatfin-server` and `-web` (`release.yml`).

## Stack

- Backend: FastAPI · Python 3.12 · SQLModel over SQLite · Pydantic v2 · httpx · yt-dlp
  (+ Deno in the image for YouTube's JS challenges) · ffmpeg subprocesses · asyncio
  tasks for background work. Software decoding is enough for SDR: HEVC 1080p + PGS
  overlay → H.264 1080p runs at ~2.8× real time on an Intel N305.
- Frontend: Vite + React 19 + TS · shadcn/ui · Tailwind v4 · TanStack Query for the
  admin site. The player is framework-free (Media Chrome web components for controls).
  JSMpeg is vendored at `public/vendor/jsmpeg.min.js` (MIT). **One build, three
  entries**, with `base: './'`: `index.html` (admin SPA), `play.html` (car player), and
  `src/inject/main.ts` → fixed-name `inject.js`. Relative asset URLs let the same files
  serve at the admin site's root and under `/car/` on the car host; `player/net.ts:
  API_PREFIX` picks `/car` from the page path.
- The `frontend` image is nginx with two servers:
  - `:80`, the admin site. It proxies `/api` (WebSocket upgrade on `/api/stream/ws`),
    resolving `backend` per request through Docker DNS, so a backend-only recreate
    recovers in ~10 s. `/assets/` is immutable; everything else is `no-cache`, so
    `inject.js` and the HTML pages update at once.
  - `:8080`, the car host (`templates/car-host.conf.template`, `EMBY_URL` filled in by
    the image's entrypoint). It routes `/car/*` (prefix stripped) to `:80`,
    `/web/index.html` to the backend's `/api/emby/web-index`, and everything else to
    Emby.
- Users put both ports behind their own HTTPS reverse proxy (`docs/reverse-proxy.md`).
  WebCodecs needs a secure context.

## Layering: domain folders + explicit ports (backend)

Domains: `auth/` (device cookies, pairing, Emby player sessions), `youtube/` (sources,
queue, download worker), `emby/` (playback info, progress reports, injected page, and
the `emby` stream resolver), `stream/` (resolver dispatch + ffmpeg), `diagnostics/`
(car test reports). Per domain: `routes.py` → `service.py` → `ports.py` (Protocol) ←
`adapter.py` (the only file importing yt_dlp, calling Emby over HTTP, or running
ffmpeg). `youtube/worker.py` holds the background loops; `youtube/layout.py` and
`emby/service.py: inject_script` are pure. `diagnostics/` and `auth/` have no external
adapter of their own (DB session + in-memory stores); `auth/ports.py` declares the
Emby token check that `emby.adapter.EmbyHttpApi` implements. `auth/deps.py` holds every
auth dependency (`require_auth`, `require_player`, `require_ws_player`, `viewer_for`).

Streams: a request is `StreamRequest(source="<kind>:<id>" | "test", t, audio, sub)`.
`StreamService` looks up the resolver for `<kind>` (`resolvers={"emby": …}` in the
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
`_ensure_column` helper. Losing the DB loses queue history and device cookies (devices
re-pair); library files are the real data. Pairings and player sessions are in memory
by design.

## Background work

- `PlaylistSyncLoop`: every `PLAYLIST_SYNC_INTERVAL_SECONDS` re-reads enabled sources;
  new entries → `Video(status=queued)`. The interval doubles as retry backoff.
- `DownloadWorker`: one at a time, oldest `queued` first. Stop reasons stay distinct:
  `failed` (auto-requeued by sync while `attempts < 3`), `cancelled` (never
  auto-retried), `interrupted` (shutdown; requeued at startup, as is anything left
  `downloading`).
- Placement: `<root>/<Channel>/Season <YYYY>/<YYYY-MM-DD> - <Title> [<id>].mp4` plus
  `.nfo` / `-thumb.jpg`, `tvshow.nfo` per channel. NFO written last. Episode =
  `MMDD*100 + n`. The container drops to `PUID:PGID` (`backend/entrypoint.sh`), which
  should be the user Emby runs as.
- Streams: `-re` paced; the WS route closes the generator with `aclosing` so ffmpeg dies
  with the socket. Emby input = the original file via `/Videos/{id}/stream?static=true`
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

## The car host hand-off (how the car plays Emby)

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
3. `play.html` POSTs the token to `/api/auth/player-session` (token only in the body).
   Emby verifies it (`GET /Users/{id}` with it), and the page gets `bsf_player`
   (HttpOnly, 12 h sliding, in memory). That cookie authorizes the stream WS and
   `/api/emby/*` only, never admin routes.
4. **The player page** lives in `frontend/src/player/` (design and measurements:
   `docs/player.md`). It's framework-free (no React or Tailwind), because it runs in
   the car for hours and will also ship as a standalone plugin.
   - **Shape:** `player/main.ts` boots `page.ts`, which puts `<car-video>` under Media
     Chrome controls. ~44 KB gz of JS + CSS.
   - **`<car-video>`** (`car-video.ts`) is a media element: `play()`, `pause()`,
     `currentTime`, `duration`, `paused`, `ended`, `volume`, `muted`, `seekable`,
     `readyState`, `error`, plus the standard events, so any media UI can drive it.
     - It knows nothing about Emby: the page gives it `source = {url(start, engine),
       duration, start}`.
     - Pause, seek, quality and track changes all reconnect with new params (the page
       calls `reload()` after changing what `url()` encodes).
     - Seeks while playing settle for `SEEK_SETTLE_MS` (300 ms) first, so dragging the
       bar or tapping +30 s three times opens one server stream.
     - 4 s with no new frame means the end (within 10 s of the runtime) or a dropped
       connection, which resumes in place. 20 s without a first frame is an error.
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
   - **Language** (`player/i18n.ts`; the admin site shares its saved choice): English
     and Chinese. It defaults to the browser's language (zh* → Chinese, anything else →
     English); the switch applies in place and is remembered in localStorage. Engines
     and `<car-video>` report technical English detail plus a reason
     (`decode`/`refused`/`timeout`/`outage`, with the WS close code), and the page
     words it. Server close reasons and subtitle errors are English.
   - **Engines** (`player/engines/`, one `StreamEngine` interface): `pickEngine()`
     chooses `webcodecs` when `VideoDecoder` supports `avc1.640028` and `AudioDecoder`
     supports AAC-LC, else `jsmpeg`; `?engine=` forces one.
   - **WebCodecs pipeline:**
     - The stream is `format=h264ts`: H.264 High 4:2:0, no B-frames, 2 s GOP, AAC-LC
       48 kHz, MPEG-TS, with `-readrate_initial_burst 2` so the client starts with a
       buffer.
     - `engines/mpegts.ts` demuxes it (PAT/PMT/PES/PTS; ADTS → raw AAC + ASC). It's
       tested against the real ffmpeg fixture `engines/__fixtures__/tiny.mpegts`, named
       `.mpegts` because `.ts` would be compiled as TypeScript.
     - **Decoding is gated:** received video waits *compressed* and is decoded only
       `DECODE_AHEAD_S` (0.5 s) ahead of the clock, with at most 24 decoded frames
       (~3 MB each at 1080p; car decoders have few output buffers). Uses
       `optimizeForLatency`. A backlog more than 1 s behind the clock jumps to the
       newest due keyframe, so a slow decoder can't build an unbounded queue.
     - The presenter uses the audio clock once the shared AudioContext runs and the
       wall clock before that (re-anchored seamlessly). It waits for 0.5 s of buffer
       (max 1.5 s) before starting, and routes audio through a per-stream GainNode, so
       pause/seek silence it at once.
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
- `X-API-Key` header: scripts and curl. Browsers never store the key.
- `bsf_device` cookie (HttpOnly, Lax, Secure behind https, 400 days, SHA-256 in DB),
  minted by key login or TV-style pairing (6-digit code + QR, approved from a signed-in
  phone; the car polls with a 128-bit pairing id and gets the cookie once).
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
Routing: pathname switch in `App.tsx` (`/`, `/test`, `/pair`); the player is its own
entry.

Styling: colors only from tokens in `src/index.css` (the player's in
`player/page.css`). `npm run lint` enforces it (stylelint `color-no-hex` +
`scripts/check-tokens.mjs`). Car-facing screens use big touch targets (≥ 56 px in the
player) and native `<select>` pickers.

UI text: every user-visible string goes through i18n (`player/i18n.ts` for the
player; `lib/i18n.ts` + `useT()` from `components/i18n.tsx` for the admin site),
English first, then Chinese. A test checks the Chinese table has every key.

## Testing

- Backend `pytest`: layout; services against fake ports (`VideoSourcePort`,
  `EmbyApiPort`, transcoder); worker placement/failure/cancel/recovery; ffmpeg argument
  building (headers, track maps, both subtitle kinds, unsafe paths, HDR paths, the
  viewer box); stream temp-file cleanup; auth/pairing/player-session API flows via
  TestClient. Mock the port, never the service.
- Frontend `vitest`: server-state hooks through MSW, auth gate flows, `QueryState`/
  `QrCode` renders, i18n, pure helpers (`inject/parse`, `player/params`, `player/net`,
  `player/quality`), the TS demuxer, and the `<car-video>` state machine with a fake
  engine (`player/car-video.test.ts`: seek coalescing, stall resume, end, fallback,
  start timeout, outage retry, stale callbacks).
- A bug fix comes with a regression test.

## Forbidden

- Business logic in `routes.py`; a service importing yt_dlp/httpx/subprocess directly.
- Hand-written FE types for API shapes; the frontend calling Emby's API directly.
- Raw hex / Tailwind palette colors outside the token files.
- Hard-coded UI strings outside the i18n tables.
- Collapsing `failed`/`cancelled`/`interrupted` into one status.
- YouTube cookies anywhere in this repo or its env.
- Any credential (API key, device/player cookie, Emby token) in a URL, browser storage
  beyond the tab-scoped hand-off, or a log line.
- A 401/403 for "not signed in yet" (see the fail2ban contract).
- Gating car-only behaviour on the User-Agent (the car's UA has no "Tesla" token).
- Imports in `src/inject/` beyond `./parse` (it must build to one standalone file).
- Unbounded ffmpeg: every stream goes through `StreamService`'s slot cap.
- Personal hostnames, addresses, paths or IDs in code, docs or tests: use
  `example.com` names and `.env` settings.

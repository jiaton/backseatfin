# Install with Docker (YouTube and Emby)

One `docker compose` setup covers both. Use what you need:

- **YouTube in the car**: the BackseatFin app. Search YouTube, follow channels, and play
  videos live in the car; they stream through your server as YouTube encoded them.
  Needs the BackseatFin server (`COMPOSE_PROFILES=server`). No Emby or Jellyfin needed.
- **Emby in the car**: the car host, a small nginx that serves Emby's own web app with the
  car player added. Emby transcodes; the player uses each viewer's own Emby sign-in.
  Emby has no plugin hook for adding a script to its web app, which is why this is a
  container rather than a plugin (Jellyfin has one: see [jellyfin.md](jellyfin.md)).

You need Docker with Compose and an HTTPS reverse proxy (the car player needs HTTPS).

## 1. Configure

```sh
git clone https://github.com/jiaton/backseatfin.git
cd backseatfin
cp .env.example .env
```

In `.env`:

| Setting | What to put |
|---|---|
| `COMPOSE_PROFILES=server` | Keep it for YouTube (and HDR tone mapping for Emby); remove it for Emby only |
| `API_KEY` | For YouTube: a random key to sign in with, `openssl rand -hex 24` |
| `APP_PORT` | For YouTube: host port of the BackseatFin app (default 8098) |
| `EMBY_URL` | For Emby: Emby as the container reaches it, e.g. `http://192.168.1.10:8096` |
| `CAR_PORT` | For Emby: host port of the car host (default 8097) |

## 2. Start

```sh
docker compose up -d
```

This pulls the published images. To build them yourself, run `docker compose build`
first.

## 3. Put it behind HTTPS

Give each port you use its own hostname, for example `tube.example.com` → `APP_PORT` and
`car.example.com` → `CAR_PORT`. See [reverse-proxy.md](reverse-proxy.md) for Caddy and
nginx examples.

## 4. In the car

**YouTube.** Open `https://tube.example.com` on your phone and sign in with `API_KEY`.
Then open it in the car: it shows a pairing code and a QR code; scan the QR code with
the signed-in phone (or type the code there) and the car is signed in for good.

- The home screen has "Continue watching", new videos from the channels you follow, and
  "Watch later". Search finds videos, channels and playlists; pasting a YouTube link
  opens what it points at.
- Play opens the car player: quality, pause (keeps the buffer), seeking, and it rides out
  dead zones. The back arrow returns to the video, which offers to resume.
- Following, history and "watch later" are stored on your server only. No Google account
  is used; YouTube sees your server's address, never the car's.
- Settings (the gear) has the YouTube → Emby downloads below, paired devices and a page
  that tests what the car's browser can play.

**Emby.** Open `https://car.example.com` in the car's browser and sign in to Emby once.
Browse as usual; Play opens the car player and the back arrow returns to Emby. The
player's settings sheet has quality, audio track, subtitles and language. Your usual Emby
address and apps stay as they are; only the car host adds the player.

With the server running, the Emby player's settings also offer **Transcoding**: *Auto*
(the default) has the BackseatFin server transcode HDR and Dolby Vision films (Emby's
own tone mapping often leaves them washed out) and Emby everything else; you can pick
either one for everything.

## Optional: HDR on an Intel GPU

Without a GPU, the server tone-maps HDR on the CPU, capped at 720p. With an Intel GPU it
runs in hardware at up to 1080p. In `.env`:

```sh
COMPOSE_FILE=docker-compose.yml:docker-compose.intel.yml
VIDEO_GID=44    # getent group video
RENDER_GID=109  # getent group render
```

NVIDIA and AMD aren't supported yet.

## Optional: YouTube → Emby downloads

The server can also follow YouTube playlists and download new videos into an Emby
library, one show per channel (for watching offline, or keeping videos).

1. Set `YOUTUBE_LIBRARY_DIR` to a host folder, and `PUID`/`PGID` to the user Emby runs as.
2. Mount the same folder at `/media/youtube` in your Emby container.
3. In Emby, add a **TV shows** library on `/media/youtube` with only the NFO metadata
   reader (online fetchers off) and real-time monitoring on.
4. Optional: set `EMBY_API_KEY` so new videos show up at once.
5. In the app's settings, add a playlist link. An unlisted playlist works.

## When YouTube stops working

YouTube changes how its site works now and then; the server uses
[yt-dlp](https://github.com/yt-dlp/yt-dlp), which usually catches up within days. Pull
the newest image (below). The server should run on a home connection: YouTube blocks
many data-center addresses.

## Update

```sh
docker compose pull && docker compose up -d
```

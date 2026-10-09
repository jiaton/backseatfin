# Install for Emby

On Emby, BackseatFin is one small container: the **car host**, an nginx that serves Emby's
own web app with the car player added. Emby does the transcoding; the player talks to
Emby with the viewer's own sign-in, so there are no extra accounts or keys.

Emby has no plugin hook for adding a script to its web app, which is why it needs this
container instead of a plugin (Jellyfin has one: see [jellyfin.md](jellyfin.md)).

You need Docker with Compose, an Emby server the container can reach, and an HTTPS
reverse proxy (the car player needs HTTPS).

## 1. Configure

```sh
git clone https://github.com/jiaton/backseatfin.git
cd backseatfin
cp .env.example .env
```

In `.env`, set:

| Setting | What to put |
|---|---|
| `EMBY_URL` | Emby as the container reaches it, e.g. `http://192.168.1.10:8096` (no trailing slash) |
| `CAR_PORT` | Host port for the car host (default 8097) |

## 2. Start

```sh
docker compose up -d
```

This pulls the published image. To build it yourself, run `docker compose build` first.

## 3. Put it behind HTTPS

Give the car host its own hostname, for example `car.example.com` → `CAR_PORT`. See
[reverse-proxy.md](reverse-proxy.md) for Caddy and nginx examples. Your usual Emby
address and apps stay as they are; only the car host adds the player.

## 4. In the car

1. Open `https://car.example.com` in the car's browser and sign in to Emby once.
2. Browse as usual. Press Play and the car player opens; the back arrow returns to Emby.

The player's settings sheet has quality, audio track, subtitles and language.

## Optional: the BackseatFin server

A second container that adds:

- **HDR and Dolby Vision tone mapping** that works (on an Intel GPU, or the CPU at up to
  720p). Emby's own often leaves HDR films washed out or doesn't run at all.
- **YouTube → Emby**: follow playlists and download new videos into an Emby library.
- **Playback in browsers without WebCodecs** (JSMpeg).

With it running, the player's settings sheet gets a **Transcoding** choice: *Auto* (the
default) uses the BackseatFin server for HDR films and Emby for everything else; you can
also pick either one for everything. The server costs about the same CPU per stream as
Emby's own transcoding, so it only does the films that need it.

Turn it on in `.env`:

```sh
COMPOSE_PROFILES=server
API_KEY=...        # a random admin key: openssl rand -hex 24
ADMIN_PORT=8098    # the admin site (YouTube sources, device pairing, a browser test page)
```

then `docker compose up -d` again, and give `ADMIN_PORT` a hostname too, for example
`admin.example.com`.

### HDR on an Intel GPU

Without a GPU, tone mapping runs on the CPU, capped at 720p. With an Intel GPU it runs in
hardware at up to 1080p. In `.env`:

```sh
COMPOSE_FILE=docker-compose.yml:docker-compose.intel.yml
VIDEO_GID=44    # getent group video
RENDER_GID=109  # getent group render
```

NVIDIA and AMD aren't supported yet.

### YouTube → Emby

The server can follow YouTube playlists and download new videos into an Emby library,
one show per channel.

1. Set `YOUTUBE_LIBRARY_DIR` to a host folder, and `PUID`/`PGID` to the user Emby runs as.
2. Mount the same folder at `/media/youtube` in your Emby container.
3. In Emby, add a **TV shows** library on `/media/youtube` with only the NFO metadata
   reader (online fetchers off) and real-time monitoring on.
4. Optional: set `EMBY_API_KEY` so new videos show up at once.
5. On the admin site, sign in with `API_KEY` and add a playlist link. An unlisted
   playlist works; no YouTube account or cookies are used.

### Sign-in on the admin site

Sign in on your phone with `API_KEY` once. To sign in the car without typing the key,
open the admin site in the car and scan its pairing QR code with the signed-in phone.
`https://admin.example.com/test` checks what the car's browser can play (WebCodecs,
JSMpeg, `<video>`).

## Update

```sh
docker compose pull && docker compose up -d
```

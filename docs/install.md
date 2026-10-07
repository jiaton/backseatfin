# Install

You need Docker with Compose, an Emby server the containers can reach, and an HTTPS
reverse proxy you already use for other services (the car player needs HTTPS).

## 1. Configure

```sh
git clone https://github.com/jiaton/backseatfin.git
cd backseatfin
cp .env.example .env
```

In `.env`, set at least:

| Setting | What to put |
|---|---|
| `API_KEY` | A random admin key: `openssl rand -hex 24` |
| `EMBY_URL` | Emby as the containers reach it, e.g. `http://192.168.1.10:8096` (no trailing slash) |
| `CAR_PORT`, `ADMIN_PORT` | Host ports for the car host and the admin site (default 8097, 8098) |

## 2. Start

```sh
docker compose up -d
```

This pulls the published images. To build them yourself, run `docker compose build`
first.

## 3. Put it behind HTTPS

Give the two ports a hostname each, for example `car.example.com` → `CAR_PORT` and
`admin.example.com` → `ADMIN_PORT`. See [reverse-proxy.md](reverse-proxy.md) for Caddy
and nginx examples.

## 4. In the car

1. Open `https://car.example.com` in the car's browser and sign in to Emby once.
2. Browse as usual. Press Play and the car player opens; the back arrow returns to Emby.
3. Optional: open `https://admin.example.com/test` to check what the car's browser can
   play (WebCodecs, JSMpeg, `<video>`) and send a report to your own server.

Your other Emby addresses and apps are unchanged; only the car host adds the player.

## Optional: HDR on an Intel GPU

HDR and Dolby Vision are tone-mapped to SDR. Without a GPU this runs on the CPU, capped
at 720p. With an Intel GPU it runs in hardware at up to 1080p. In `.env`:

```sh
COMPOSE_FILE=docker-compose.yml:docker-compose.intel.yml
VIDEO_GID=44    # getent group video
RENDER_GID=109  # getent group render
```

NVIDIA and AMD aren't supported yet.

## Optional: YouTube → Emby

The server can follow YouTube playlists and download new videos into an Emby library,
one show per channel.

1. Set `YOUTUBE_LIBRARY_DIR` to a host folder, and `PUID`/`PGID` to the user Emby runs as.
2. Mount the same folder at `/media/youtube` in your Emby container.
3. In Emby, add a **TV shows** library on `/media/youtube` with only the NFO metadata
   reader (online fetchers off) and real-time monitoring on.
4. Optional: set `EMBY_API_KEY` so new videos show up at once.
5. On the admin site, sign in with `API_KEY` and add a playlist link. An unlisted
   playlist works; no YouTube account or cookies are used.

## Sign-in on the admin site

Sign in on your phone with `API_KEY` once. To sign in the car without typing the key,
open the admin site in the car and scan its pairing QR code with the signed-in phone.

## Update

```sh
docker compose pull && docker compose up -d
```

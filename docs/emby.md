# Emby in the car

On Emby, BackseatFin is one small container, the **car host**: an nginx that serves
Emby's own web app with the car player added. Open it in the car, browse Emby as usual,
press Play, and the video plays on a canvas the car doesn't block while driving. Emby
transcodes; the player uses each viewer's own Emby sign-in, so there are no extra
accounts or keys. Your usual Emby address and apps stay as they are.

Emby has no plugin hook for adding a script to its web app (Jellyfin has one: see
[jellyfin.md](jellyfin.md)), which is why this is a container in front of Emby.

You need Docker with Compose, an Emby server the container can reach, and an HTTPS
reverse proxy (the car player needs HTTPS).

## 1. Configure

```sh
git clone https://github.com/jiaton/backseatfin.git
cd backseatfin
cp .env.example .env
```

In `.env`:

| Setting | What to put |
|---|---|
| `EMBY_URL` | Emby as the container reaches it, e.g. `http://192.168.1.10:8096` (no trailing slash) |
| `CAR_PORT` | Host port of the car host (default 8097) |

Leave `COMPOSE_PROFILES` commented out: the car host doesn't need the server.

## 2. Start

```sh
docker compose up -d
```

## 3. Put it behind HTTPS

Give the car host its own hostname, for example `car.example.com` → `CAR_PORT`. Point
it at this container, not at Emby: the container is what adds the player. See
[reverse-proxy.md](reverse-proxy.md) for Caddy and nginx examples.

## 4. In the car

Open `https://car.example.com` in the car's browser and sign in to Emby once. Browse as
usual; Play opens the car player and the back arrow returns to where you were. Progress
and "watched" sync with Emby like any other client.

The player's settings sheet has quality (each level shows its real picture size, bitrate
and data per hour), audio track, subtitles (burned in by Emby) and language, and a
"Stats for nerds" panel.

## Optional: HDR films (the BackseatFin server)

Emby's own tone mapping often leaves HDR and Dolby Vision films washed out. The
BackseatFin server can transcode those instead, on an Intel GPU (up to 1080p) or the CPU
(up to 720p). In `.env`, uncomment `COMPOSE_PROFILES=server` and set `API_KEY`, then
`docker compose up -d` again. The player's settings then offer **Transcoding**: *Auto*
(the default: the server for HDR films, Emby for the rest), *Emby* or *BackseatFin
server*. The same server also gives you [YouTube in the car](youtube.md).

For the Intel GPU, also set:

```sh
COMPOSE_FILE=docker-compose.yml:docker-compose.intel.yml
VIDEO_GID=44    # getent group video
RENDER_GID=109  # getent group render
```

NVIDIA and AMD aren't supported yet.

## Update

```sh
docker compose pull && docker compose up -d
```

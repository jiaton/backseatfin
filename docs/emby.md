# Emby in the car

Open Emby in the car, browse as usual, press Play, and the video plays on a canvas the
car doesn't block while driving. Emby transcodes; the player uses each viewer's own Emby
sign-in, so there are no extra accounts or keys.

The car player is a few static files (under 1 MB). Two things make it work: Emby's page
loads its script (`/car/inject.js`), and the files are served under `/car/` on the same
hostname as Emby. Emby has no plugin hook for adding a script to its web app (Jellyfin
has one: see [jellyfin.md](jellyfin.md)), so your reverse proxy does it. Use a
**separate hostname for the car**, for example `car.example.com`: only browsers that
open it get the car player; your usual Emby address and apps stay as they are.

Pick one of three ways. The car needs HTTPS (the player uses WebCodecs, which browsers
allow only on secure pages).

## A. You already use nginx

1. Download the player and unpack it, e.g. into `/srv/backseatfin`:

   ```sh
   curl -LO https://github.com/jiaton/backseatfin/releases/latest/download/backseatfin-emby-player.zip
   sudo mkdir -p /srv/backseatfin && sudo unzip -o backseatfin-emby-player.zip -d /srv/backseatfin
   ```

   (`unzip` may need installing first: `sudo apt install unzip`.)

2. Add a server for the car hostname (replace `192.168.1.10:8096` with your Emby and
   add your usual certificate lines). nginx needs its `sub_filter` module, which most
   builds include (`nginx -V 2>&1 | grep -o http_sub_module`).

   ```nginx
   map $http_upgrade $connection_upgrade {
       default upgrade;
       ''      close;
   }

   server {
       listen 443 ssl;
       server_name car.example.com;
       # ssl_certificate ...;

       client_max_body_size 0;

       # Emby's page, plus the car player's script.
       location ~ ^/web/(index\.html)?$ {
           proxy_pass http://192.168.1.10:8096;
           proxy_set_header Host $host;
           proxy_set_header Accept-Encoding "";
           sub_filter '</head>' '<script type="module" src="/car/inject.js"></script></head>';
           sub_filter_once on;
       }

       # The car player.
       location /car/ {
           alias /srv/backseatfin/;
           try_files $uri $uri.html =404;
       }

       # Everything else: Emby.
       location / {
           proxy_pass http://192.168.1.10:8096;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection $connection_upgrade;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_buffering off;
           proxy_read_timeout 6h;
       }
   }
   ```

3. `sudo nginx -t && sudo nginx -s reload`. To update later, download and unpack the zip
   again.

At each Play the player asks `/car/health` whether the optional BackseatFin server is
there (way C only); with A and B that's a 404, which is expected.

## B. You already use Caddy

Caddy can't change a page's content on its own; it needs the
[replace-response](https://github.com/caddyserver/replace-response) plugin. If your Caddy
doesn't have it, build one with `xcaddy build --with github.com/caddyserver/replace-response`,
or use way C instead. With Docker, this Dockerfile makes a Caddy image with it (`docker
build -t caddy-replace .`, then use `caddy-replace` in place of `caddy:2`):

```dockerfile
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/caddyserver/replace-response
FROM caddy:2
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
```

1. Download and unpack the player as in A, step 1.
2. In the Caddyfile: the global `order` line, and a site for the car hostname.

   ```caddyfile
   {
       order replace after encode
   }

   car.example.com {
       # The car player.
       handle_path /car/* {
           root * /srv/backseatfin
           try_files {path} {path}.html
           file_server
       }

       # Emby's page, plus the car player's script.
       @index path /web/ /web/index.html
       handle @index {
           replace "</head>" "<script type=\"module\" src=\"/car/inject.js\"></script></head>"
           reverse_proxy 192.168.1.10:8096 {
               header_up Accept-Encoding identity
           }
       }

       # Everything else: Emby.
       handle {
           reverse_proxy 192.168.1.10:8096
       }
   }
   ```

3. Reload Caddy.

### Or: no files at all (hosted player)

Instead of downloading the zip, your proxy can load the player from this project's
GitHub Pages: then the only change is the line that adds the script, pointing at
`https://jiaton.github.io/backseatfin/emby/inject.js`, and there's no `/car/` location or
`handle_path /car/*` block. The player opens from there and talks to your Emby directly
(Emby allows that); it always runs the latest release. It needs the car hostname to
resolve to a public address, as it does through a normal reverse proxy: Chrome blocks a
public page (GitHub Pages) from calling a private one (a LAN or VPN address), so if
yours resolves privately, use the zip (the player then says the browser didn't let it
reach Emby).

nginx (in place of the `/web/` location's `sub_filter` line, and without `location /car/`):

```nginx
sub_filter '</head>' '<script type="module" src="https://jiaton.github.io/backseatfin/emby/inject.js"></script></head>';
```

Caddy (in place of the `replace` line, and without `handle_path /car/*`):

```caddyfile
replace "</head>" "<script type=\"module\" src=\"https://jiaton.github.io/backseatfin/emby/inject.js\"></script></head>"
```

> [!CAUTION]
> This runs code from GitHub Pages inside your Emby page, with access to your Emby
> sign-in, and it changes whenever a new release is published. Whoever can publish to
> this project's Pages (its maintainers, or someone who takes over their account) could
> read your Emby session. The zip doesn't have that risk: you choose what runs and when
> it updates. Use the hosted player only if you're fine trusting this project like a
> browser extension.

## C. The BackseatFin container

No web server of your own, or a Caddy without plugins: run the car host, a small nginx
container that does all of the above, and point your reverse proxy (any) at it.

```sh
git clone https://github.com/jiaton/backseatfin.git && cd backseatfin
cp .env.example .env    # uncomment EMBY_URL and set it, e.g. http://192.168.1.10:8096
docker compose pull && docker compose up -d
```

`EMBY_URL` is Emby as the container reaches it: use the host's LAN address, not
`localhost` (inside the container that's the container itself). If Emby is a container on
the same host without a published port, join its network instead, with a
`docker-compose.override.yml` next to the compose file (`emby` being Emby's container
name and `emby_default` its network, as `docker inspect emby` shows), and set
`EMBY_URL=http://emby:8096`:

```yaml
services:
  frontend:
    networks: [default, emby]
networks:
  emby:
    external: true
    name: emby_default
```

Then give `CAR_PORT` (default 8097) the car hostname: in Caddy simply
`car.example.com { reverse_proxy 192.168.1.10:8097 }`; nginx examples are in
[reverse-proxy.md](reverse-proxy.md). Update with `docker compose pull && docker compose up -d`.

## In the car

Open `https://car.example.com` in the car's browser and sign in to Emby once. Browse as
usual; Play opens the car player (with the audio and subtitles picked on Emby's page) and
the back arrow returns to where you were. Progress
and "watched" sync with Emby like any other client.

The player's settings sheet has quality (each level shows its real picture size, bitrate
and data per hour), audio track, subtitles, language, and "Stats for
nerds". While a video loads, the player says what it's doing and how fast the network is.

### Subtitles

Text subtitles (SRT, ASS, WebVTT) are drawn by the car player in the browser's own font
(plain lines; ASS styling is dropped). Emby's transcode sends them alongside the video in
small WebVTT pieces, read from the file in the same pass as the picture, so they cost
nothing extra and show from the start. Picture subtitles (PGS, DVD) are burned into the
picture by Emby.

Why not burn text subtitles in too: Emby's ffmpeg would read the whole file at every
start and every long skip, before the first picture (33 s for a 1.9 GB episode on a NAS
disk, against 0.3 s without subtitles).

## Optional: HDR films (the BackseatFin server, way C only)

Emby's own tone mapping often leaves HDR and Dolby Vision films washed out. The
BackseatFin server can transcode those instead, on an Intel GPU (up to 1080p) or the CPU
(up to 720p). In `.env`, uncomment `COMPOSE_PROFILES=server`, then
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

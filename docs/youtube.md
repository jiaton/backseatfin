# YouTube in the car

The BackseatFin app is a YouTube app made for the car's touchscreen: search, follow
channels and playlists, pick up where you stopped. Videos play in the car player and
stream through your own server as YouTube encoded them (no re-encoding, so the server
barely works). No Google account is used; YouTube sees your server's address, never the
car's, and your history stays on your server.

It needs the **BackseatFin server** (a Docker container next to the app). You don't
need Emby or Jellyfin for it.

You need Docker with Compose, an HTTPS reverse proxy (the car player needs HTTPS), and a
home internet connection (YouTube blocks many data-center addresses).

## 1. Configure

```sh
git clone https://github.com/jiaton/backseatfin.git
cd backseatfin
cp .env.example .env
```

In `.env`:

| Setting | What to put |
|---|---|
| `COMPOSE_PROFILES=server` | Uncomment it: this starts the server |
| `APP_PORT` | Host port of the app (default 8098) |

## 2. Start

```sh
docker compose up -d
```

This pulls the published images (`ghcr.io/jiaton/backseatfin-server` and `-web`). To
build them yourself, run `docker compose build` first.

## 3. Put it behind HTTPS

Give the app its own hostname, for example `tube.example.com` → `APP_PORT`. See
[reverse-proxy.md](reverse-proxy.md) for Caddy and nginx examples.

## 4. Sign in

1. Get the setup code: at its first start the server prints one to its log.

   ```sh
   docker compose logs backend | grep "Setup code"
   ```

2. On your phone, open `https://tube.example.com`, choose "Sign in with a setup code"
   and enter it. The code works once, for 24 hours.
3. In the car, open the same address: it shows a pairing code and a QR code. Scan the QR
   code with the signed-in phone (or type the code in the phone's Settings → Devices).
   The car stays signed in.

### A new phone

- **The old one is still signed in:** open the app on the new phone (it shows a pairing
  code) and approve it from the old one, like the car.
- **No device is signed in any more** (lost phone), or the first code expired: make a
  new code on the server. It works once, for 15 minutes.

  ```sh
  docker compose exec backend backseatfin-code
  ```

  Then sign out the lost phone in Settings → Devices.

Five wrong tries burn a code (make a new one). For scripts, set `API_KEY` in `.env` and
send it as the `X-API-Key` header; a browser can also sign in with it instead of a code.

### Protecting it

The app takes care of its own sign-in; brute force is up to your reverse proxy. The
server answers 401/403 only to a wrong code, key or device, so a fail2ban jail on those
in the proxy's access log is enough ([reverse-proxy.md](reverse-proxy.md#fail2ban)).
Keep the video off CDN proxies (e.g. Cloudflare's orange cloud or Tunnel): their terms
usually forbid streaming video through them.

## Using it

- **Home**: "Continue watching", your followed playlists, new videos from the channels
  you follow, "Recommended for you" and "Watch later".
- **Search** finds videos, channels and playlists. Pasting a YouTube link opens what it
  points at.
- **From the phone to the car**: YouTube's own playlists are the way in. Make a playlist
  on YouTube (public or *unlisted*; private ones can't be read, since BackseatFin never
  signs in to YouTube), then add it in Settings → Following (paste its link) or open it
  and tap "Show on home". Whatever you add to it on the phone is on the car's home screen
  the next time home opens.
- **Follow a channel** from its page or a video's page; its new videos show on home.
  Unfollow in Settings → Following.
- **Recommended for you** comes only from what you do here: channels you watch (often,
  or recently), older videos of channels you follow, and searches you repeat. It can't
  find new creators the way YouTube does.
- **Playing**: quality, pause (keeps the buffer), seeking, chapters; it rides out dead
  zones. While it loads it says what it's doing and how fast the network is. The back
  arrow returns to the video, which offers to resume.
- **One after another**: a video started from a playlist (its page has "Play all"), a
  followed playlist's home row or "Watch later" is followed by the next one in that list
  ("Up next" counts down 8 seconds; Play now or Cancel). A video in the list that won't
  play (taken down since) offers a button for the one after it; nothing skips by itself.
- **Captions**: the player's settings list the uploader's subtitles in the video's
  language and the app's languages, or YouTube's automatic captions in the video's
  language. They're drawn over the picture; the language you pick is used again next
  time. (YouTube's machine translations of automatic captions aren't offered: YouTube
  refuses them to servers more often than not.)
- **Live streams** play from the live edge (and don't go into "Continue watching").

## When YouTube stops working

YouTube changes how its site works now and then. The server uses
[yt-dlp](https://github.com/yt-dlp/yt-dlp), usually fixed within days, and installs its
newest release each time it starts (`YTDLP_AUTO_UPDATE=1`): restart the server
(`docker compose restart backend`), or update everything as below.

## Update

```sh
docker compose pull && docker compose up -d
```

## With Emby too

The same setup can run the Emby car host as well: see [emby.md](emby.md). With both, the
server also tone-maps Emby's HDR films for the car.

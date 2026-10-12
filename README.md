<div align="center">

# BackseatFin

**Watch your Jellyfin or Emby library, and YouTube, in the car's browser, even while the car is moving.**

[![CI](https://github.com/jiaton/backseatfin/actions/workflows/ci.yml/badge.svg)](https://github.com/jiaton/backseatfin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jiaton/backseatfin?include_prereleases)](https://github.com/jiaton/backseatfin/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Emby](https://img.shields.io/badge/Emby-supported-52b54b)](https://emby.media)
[![Jellyfin](https://img.shields.io/badge/Jellyfin-plugin-aa5cc3)](docs/jellyfin.md)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-2496ed?logo=docker&logoColor=white)](https://github.com/jiaton?tab=packages&repo_name=backseatfin)

English · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [Español](README.es.md) · [Deutsch](README.de.md)

</div>

![Car player screenshot](docs/images/player.jpg)

<sub>Screenshot: [Sintel](https://durian.blender.org/) © Blender Foundation, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).</sub>

Car browsers such as Tesla's stop `<video>` while driving, but they keep drawing
`<canvas>`. BackseatFin adds a canvas player to your media server's own web app, and
brings a YouTube app of its own: open it in the car, press Play, and it plays.

- **No extra server.** Jellyfin: a plugin. Emby: one small nginx container. Your media
  server does the transcoding, and the player uses your own sign-in.
- **Your library, your server.** Seeking, audio tracks, subtitles (including PGS), resume
  points and "watched" all sync with the server.
- **Light on the car.** It uses the car's hardware H.264 decoder via WebCodecs, falling
  back to JSMpeg. The stream is sized to the screen, and it rides out dead zones.
- **HDR and Dolby Vision** are tone-mapped (Jellyfin: by Jellyfin; Emby: by the optional
  BackseatFin server, on an Intel GPU or the CPU).
- **YouTube, self-hosted.** Search, follow channels and pick up where you stopped, on a
  screen made for the car. Videos stream through your own server as YouTube encoded
  them (no re-encoding). No Google account, and your history stays with you. Downloading
  into Emby is there too.

> [!WARNING]
> For passengers. The driver must keep their eyes on the road. Watching video while
> driving is dangerous and illegal in most places.

## Quick start

**Jellyfin** (12.0+): add the plugin repository
`https://jiaton.github.io/backseatfin/jellyfin/manifest.json` in Dashboard → Plugins →
Repositories, install **BackseatFin**, restart, and choose which browsers get the car
player. Guide: [docs/jellyfin.md](docs/jellyfin.md).

**YouTube and Emby**: run BackseatFin with Docker.

```sh
git clone https://github.com/jiaton/backseatfin.git && cd backseatfin
cp .env.example .env   # set API_KEY (YouTube) and/or EMBY_URL (Emby)
docker compose up -d
```

Then put it behind HTTPS ([examples](docs/reverse-proxy.md)) and open it in the car.
Guide: [docs/install.md](docs/install.md).

## How it works

```
Jellyfin:  car browser ──► Jellyfin web app + plugin script
                              └─► /BackseatFin/play ◄── Jellyfin's HLS transcode (H.264)

Emby:      car browser ──► car host (nginx) ──► Emby web app + inject.js
                              └─► /car/play ◄── Emby's HLS transcode (H.264)
                                            ◄── optional BackseatFin server (HDR)

YouTube:   car browser ──► BackseatFin app (search, channels, history)
                              └─► /play ◄── BackseatFin server ◄── YouTube's H.264, passed through
```

Pressing Play opens the player over the server's page. It decodes the H.264 stream with
the car's hardware decoder (WebCodecs) and draws it on a canvas. Details for contributors
are in [AGENTS.md](AGENTS.md) and [docs/player.md](docs/player.md).

## Roadmap

- [x] Emby, via the car host (reverse-proxy injection), playing Emby's own HLS
- [x] Jellyfin plugin, playing Jellyfin's own HLS (no extra server)
- [x] HDR / Dolby Vision tone mapping (Intel GPU, CPU)
- [x] YouTube playlists → Emby library
- [x] YouTube in the car: search, follow channels, play live, resume
- [ ] Send a video from the phone to the car; playlists play through; captions; live streams
- [ ] NVIDIA and AMD GPUs

## License

[MIT](LICENSE), except the Jellyfin plugin in `jellyfin-plugin/`, which is
[GPLv3](jellyfin-plugin/LICENSE) because it links against Jellyfin. Bundles
[JSMpeg](https://github.com/phoboslab/jsmpeg) (MIT) and uses
[Media Chrome](https://github.com/muxinc/media-chrome) (MIT).

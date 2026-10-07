<div align="center">

# BackseatFin

**Schau deine eigene Emby-Bibliothek im Browser des Autos an, auch während der Fahrt.**

[![CI](https://github.com/jiaton/backseatfin/actions/workflows/ci.yml/badge.svg)](https://github.com/jiaton/backseatfin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jiaton/backseatfin?include_prereleases)](https://github.com/jiaton/backseatfin/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Emby](https://img.shields.io/badge/Emby-supported-52b54b)](https://emby.media)
[![Jellyfin](https://img.shields.io/badge/Jellyfin-planned-aa5cc3)](#roadmap)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-2496ed?logo=docker&logoColor=white)](https://github.com/jiaton?tab=packages&repo_name=backseatfin)

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [Español](README.es.md) · Deutsch

Dieses Dokument ist eine Übersetzung der englischen README; maßgeblich ist die englische Version.

</div>

Fahrzeugbrowser wie der von Tesla stoppen `<video>` während der Fahrt, zeichnen aber
weiterhin `<canvas>`. BackseatFin fügt der eigenen Web-App von Emby einen Canvas-Player
hinzu: Emby im Auto öffnen, auf Play drücken, und es läuft.

- **Deine Bibliothek, dein Server.** Suchlauf, Audiospuren, Untertitel (einschließlich
  PGS), Wiedergabepunkte und der "gesehen"-Status werden alle mit Emby synchronisiert.
- **Schont das Auto.** Nutzt den Hardware-H.264-Decoder des Autos über WebCodecs, mit
  JSMpeg als Fallback. Der Stream wird an die Bildschirmgröße angepasst und überbrückt
  Funklöcher.
- **HDR und Dolby Vision** werden auf dem Server tonkartiert, auf einer Intel-GPU oder
  der CPU.
- **YouTube ohne die Plattform** (optional): Playlists abonnieren, auf die eigene
  Festplatte herunterladen, in Emby ansehen. Kein Konto, keine Gebühren, und die Daten
  bleiben bei dir.

> [!WARNING]
> Für Mitfahrer. Der Fahrer muss die Augen auf die Straße gerichtet halten. Videos
> während der Fahrt anzusehen ist gefährlich und an den meisten Orten illegal.

## Schnellstart

```sh
git clone https://github.com/jiaton/backseatfin.git && cd backseatfin
cp .env.example .env   # set API_KEY and EMBY_URL
docker compose up -d
```

Anschließend beide Ports hinter HTTPS stellen ([Beispiele](docs/reverse-proxy.md)) und
die Adresse des Car Hosts im Auto öffnen. Vollständige Anleitung:
[docs/install.md](docs/install.md).

## Funktionsweise

```
Car browser ──► car host (nginx) ──► Emby web app + inject.js
                    │
                    └──► /car/play ──► BackseatFin server ──► ffmpeg ──► Emby file
                         canvas player ◄── H.264 over WebSocket
```

Ein Druck auf Play in Emby öffnet den Player über der Emby-Seite. Der Server
transkodiert die Datei mit ffmpeg und streamt sie an den Player, der sie auf ein
Canvas decodiert. Details für Mitwirkende stehen in [AGENTS.md](AGENTS.md) und
[docs/player.md](docs/player.md).

## Roadmap

- [x] Emby, über den Car Host (Reverse-Proxy-Injection)
- [x] HDR-/Dolby-Vision-Tonkartierung (Intel-GPU, CPU)
- [x] YouTube-Playlists → Emby-Bibliothek
- [ ] Den eigenen HLS-Stream des Mediaservers abspielen, damit der Player ohne den
      Server funktioniert
- [ ] Jellyfin-Plugin
- [ ] YouTube-UI: Kanäle abonnieren, direkt herunterladen oder streamen
- [ ] NVIDIA- und AMD-GPUs

## Lizenz

[MIT](LICENSE). Enthält [JSMpeg](https://github.com/phoboslab/jsmpeg) (MIT) und
verwendet [Media Chrome](https://github.com/muxinc/media-chrome) (MIT).

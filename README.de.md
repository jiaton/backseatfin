<div align="center">

# BackseatFin

**Schau deine Jellyfin- oder Emby-Bibliothek und YouTube im Browser des Autos an, auch während der Fahrt.**

[![CI](https://github.com/jiaton/backseatfin/actions/workflows/ci.yml/badge.svg)](https://github.com/jiaton/backseatfin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jiaton/backseatfin?include_prereleases)](https://github.com/jiaton/backseatfin/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Emby](https://img.shields.io/badge/Emby-supported-52b54b)](https://emby.media)
[![Jellyfin](https://img.shields.io/badge/Jellyfin-plugin-aa5cc3)](docs/jellyfin.md)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-2496ed?logo=docker&logoColor=white)](https://github.com/jiaton?tab=packages&repo_name=backseatfin)

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [Español](README.es.md) · Deutsch

Dieses Dokument ist eine Übersetzung der englischen README; maßgeblich ist die englische Version.

</div>

![Screenshot des Players](docs/images/player.jpg)

<sub>Screenshot: [Sintel](https://durian.blender.org/) © Blender Foundation, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).</sub>

Fahrzeugbrowser wie der von Tesla stoppen `<video>` während der Fahrt, zeichnen aber
weiterhin `<canvas>`. BackseatFin fügt der eigenen Web-App deines Media-Servers einen
Canvas-Player hinzu: Jellyfin oder Emby im Auto öffnen, auf Play drücken, und es läuft.

- **Kein zusätzlicher Server.** Jellyfin: ein Plugin. Emby: ein kleiner nginx-Container.
  Die Transkodierung übernimmt dein Medienserver, und der Player nutzt deine eigene
  Anmeldung.
- **Deine Bibliothek, dein Server.** Suchlauf, Audiospuren, Untertitel (einschließlich
  PGS), Wiedergabepunkte und der "gesehen"-Status werden alle mit dem Server
  synchronisiert.
- **Schont das Auto.** Nutzt den Hardware-H.264-Decoder des Autos über WebCodecs, mit
  JSMpeg als Fallback. Der Stream wird an die Bildschirmgröße angepasst und überbrückt
  Funklöcher.
- **HDR und Dolby Vision** werden tonkartiert (Jellyfin: durch Jellyfin selbst; Emby: durch
  den optionalen BackseatFin-Server, auf einer Intel-GPU oder der CPU).
- **YouTube, selbst gehostet.** Suchen, Kanälen folgen und dort weiterschauen, wo du
  aufgehört hast, auf einer Oberfläche fürs Auto. Videos laufen über deinen eigenen
  Server, so wie YouTube sie kodiert hat (ohne Neukodierung). Kein Google-Konto, und
  dein Verlauf bleibt bei dir. Herunterladen nach Emby geht auch.

> [!WARNING]
> Für Mitfahrer. Der Fahrer muss die Augen auf die Straße gerichtet halten. Videos
> während der Fahrt anzusehen ist gefährlich und an den meisten Orten illegal.

## Schnellstart

**Jellyfin** (12.0+): das Plugin-Repository
`https://jiaton.github.io/backseatfin/jellyfin/manifest.json` unter Dashboard →
Plugins → Repositories hinzufügen, **BackseatFin** installieren, neu starten und
auswählen, welche Browser den Car Player bekommen. Anleitung:
[docs/jellyfin.md](docs/jellyfin.md).

**YouTube und Emby**: BackseatFin mit Docker betreiben.

```sh
git clone https://github.com/jiaton/backseatfin.git && cd backseatfin
cp .env.example .env   # API_KEY (YouTube) und/oder EMBY_URL (Emby) setzen
docker compose up -d
```

Anschließend hinter HTTPS stellen ([Beispiele](docs/reverse-proxy.md)) und im Auto
öffnen. Anleitung: [docs/install.md](docs/install.md).

## Funktionsweise

```
Jellyfin:  car browser ──► Jellyfin web app + plugin script
                              └─► /BackseatFin/play ◄── Jellyfin's HLS transcode (H.264)

Emby:      car browser ──► car host (nginx) ──► Emby web app + inject.js
                              └─► /car/play ◄── Emby's HLS transcode (H.264)
                                            ◄── optional BackseatFin server (HDR)

YouTube:   car browser ──► BackseatFin app (search, channels, history)
                              └─► /play ◄── BackseatFin server ◄── YouTube's H.264, passed through
```

Ein Druck auf Play öffnet den Player über der Seite des Servers. Er decodiert den
H.264-Stream mit dem Hardware-Decoder des Autos (WebCodecs) und zeichnet ihn auf ein
Canvas. Details für Mitwirkende stehen in [AGENTS.md](AGENTS.md) und
[docs/player.md](docs/player.md).

## Roadmap

- [x] Emby, über den Car Host (Reverse-Proxy-Injection), mit Embys eigenem HLS
- [x] Jellyfin-Plugin, das Jellyfins eigenes HLS abspielt (ohne zusätzlichen Server)
- [x] HDR-/Dolby-Vision-Tonkartierung (Intel-GPU, CPU)
- [x] YouTube-Playlists → Emby-Bibliothek
- [x] YouTube im Auto: suchen, Kanälen folgen, live abspielen, weiterschauen
- [ ] Videos vom Handy ans Auto schicken; Playlists am Stück; Untertitel; Livestreams
- [ ] NVIDIA- und AMD-GPUs

## Lizenz

[MIT](LICENSE), außer dem Jellyfin-Plugin in `jellyfin-plugin/`, das wegen der
Verlinkung zu Jellyfin unter [GPLv3](jellyfin-plugin/LICENSE) steht. Enthält
[JSMpeg](https://github.com/phoboslab/jsmpeg) (MIT) und verwendet
[Media Chrome](https://github.com/muxinc/media-chrome) (MIT).

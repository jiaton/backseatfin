<div align="center">

# BackseatFin

**Mira tu propia biblioteca de Emby en el navegador del coche, incluso mientras el coche está en movimiento.**

[![CI](https://github.com/jiaton/backseatfin/actions/workflows/ci.yml/badge.svg)](https://github.com/jiaton/backseatfin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jiaton/backseatfin?include_prereleases)](https://github.com/jiaton/backseatfin/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Emby](https://img.shields.io/badge/Emby-supported-52b54b)](https://emby.media)
[![Jellyfin](https://img.shields.io/badge/Jellyfin-planned-aa5cc3)](#roadmap)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-2496ed?logo=docker&logoColor=white)](https://github.com/jiaton?tab=packages&repo_name=backseatfin)

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · Español · [Deutsch](README.de.md)

Este documento es una traducción del README en inglés; el README en inglés es la versión autorizada.

</div>

Los navegadores de los coches, como el de Tesla, detienen el `<video>` mientras se
conduce, pero siguen dibujando el `<canvas>`. BackseatFin añade un reproductor de
canvas a la propia aplicación web de Emby: abre Emby en el coche, pulsa Reproducir, y
se reproduce.

- **Tu biblioteca, tu servidor.** La búsqueda, las pistas de audio, los subtítulos
  (incluido PGS), los puntos de reanudación y el estado de "visto" se sincronizan con
  Emby.
- **Ligero para el coche.** Usa el decodificador de hardware H.264 del coche mediante
  WebCodecs, con JSMpeg como alternativa. La transmisión se ajusta al tamaño de la
  pantalla y resiste las zonas sin señal.
- **HDR y Dolby Vision** se mapean tonalmente en el servidor, con una GPU Intel o con
  la CPU.
- **YouTube sin la plataforma** (opcional): sigue listas de reproducción, descarga a
  tu propio disco y mira en Emby. Sin cuenta, sin tarifas, y los datos se quedan
  contigo.
- Interfaz en inglés y chino.

> [!WARNING]
> Para pasajeros. El conductor debe mantener la vista en la carretera. Ver vídeos
> mientras se conduce es peligroso e ilegal en la mayoría de los lugares.

## Inicio rápido

```sh
git clone https://github.com/jiaton/backseatfin.git && cd backseatfin
cp .env.example .env   # set API_KEY and EMBY_URL
docker compose up -d
```

Después, pon los dos puertos detrás de HTTPS ([ejemplos](docs/reverse-proxy.md)) y
abre la dirección del car host en el coche. Guía completa:
[docs/install.md](docs/install.md).

## Cómo funciona

```
Car browser ──► car host (nginx) ──► Emby web app + inject.js
                    │
                    └──► /car/play ──► BackseatFin server ──► ffmpeg ──► Emby file
                         canvas player ◄── H.264 over WebSocket
```

Al pulsar Reproducir en Emby se abre el reproductor sobre la página de Emby. El
servidor transcodifica el archivo con ffmpeg y lo transmite al reproductor, que lo
decodifica en un canvas. Los detalles para colaboradores están en
[AGENTS.md](AGENTS.md) y [docs/player.md](docs/player.md).

## Hoja de ruta

- [x] Emby, a través del car host (inyección por proxy inverso)
- [x] Mapeo tonal de HDR / Dolby Vision (GPU Intel, CPU)
- [x] Listas de reproducción de YouTube → biblioteca de Emby
- [ ] Reproducir el propio HLS del servidor multimedia, para que el reproductor
      funcione sin el servidor
- [ ] Plugin de Jellyfin
- [ ] Interfaz de YouTube: seguir canales, descargar o transmitir directamente
- [ ] GPUs de NVIDIA y AMD

## Licencia

[MIT](LICENSE). Incluye [JSMpeg](https://github.com/phoboslab/jsmpeg) (MIT) y usa
[Media Chrome](https://github.com/muxinc/media-chrome) (MIT).

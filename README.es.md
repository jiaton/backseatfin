<div align="center">

# BackseatFin

**Mira tu propia biblioteca de Jellyfin o Emby en el navegador del coche, incluso mientras el coche está en movimiento.**

[![CI](https://github.com/jiaton/backseatfin/actions/workflows/ci.yml/badge.svg)](https://github.com/jiaton/backseatfin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jiaton/backseatfin?include_prereleases)](https://github.com/jiaton/backseatfin/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Emby](https://img.shields.io/badge/Emby-supported-52b54b)](https://emby.media)
[![Jellyfin](https://img.shields.io/badge/Jellyfin-plugin-aa5cc3)](docs/jellyfin.md)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-2496ed?logo=docker&logoColor=white)](https://github.com/jiaton?tab=packages&repo_name=backseatfin)

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · Español · [Deutsch](README.de.md)

Este documento es una traducción del README en inglés; el README en inglés es la versión autorizada.

</div>

Los navegadores de los coches, como el de Tesla, detienen el `<video>` mientras se
conduce, pero siguen dibujando el `<canvas>`. BackseatFin añade un reproductor de
canvas a la propia aplicación web de tu servidor multimedia: abre Jellyfin o Emby en
el coche, pulsa Reproducir, y se reproduce.

- **Jellyfin: solo un plugin.** Sin servidor adicional; la transcodificación la hace
  Jellyfin.
- **Tu biblioteca, tu servidor.** La búsqueda, las pistas de audio, los subtítulos
  (incluido PGS), los puntos de reanudación y el estado de "visto" se sincronizan con
  el servidor.
- **Ligero para el coche.** Usa el decodificador de hardware H.264 del coche mediante
  WebCodecs, con JSMpeg como alternativa. La transmisión se ajusta al tamaño de la
  pantalla y resiste las zonas sin señal.
- **HDR y Dolby Vision** se mapean tonalmente (Emby: por el servidor de BackseatFin,
  con una GPU Intel o la CPU; Jellyfin: por Jellyfin).
- **YouTube sin la plataforma** (opcional, solo Emby): sigue listas de reproducción,
  descarga a tu propio disco y mira en Emby. Sin cuenta, sin tarifas, y los datos se
  quedan contigo.

> [!WARNING]
> Para pasajeros. El conductor debe mantener la vista en la carretera. Ver vídeos
> mientras se conduce es peligroso e ilegal en la mayoría de los lugares.

## Inicio rápido

**Jellyfin** (12.0+): añade el repositorio de plugins
`https://jiaton.github.io/backseatfin/jellyfin/manifest.json` en Dashboard → Plugins →
Repositories, instala **BackseatFin**, reinicia, y elige qué navegadores obtienen el
reproductor del coche. Guía: [docs/jellyfin.md](docs/jellyfin.md).

**Emby**: ejecuta el servidor de BackseatFin junto a él.

```sh
git clone https://github.com/jiaton/backseatfin.git && cd backseatfin
cp .env.example .env   # set API_KEY and EMBY_URL
docker compose up -d
```

Después, pon los dos puertos detrás de HTTPS ([ejemplos](docs/reverse-proxy.md)) y
abre la dirección del car host en el coche. Guía:
[docs/install.md](docs/install.md).

## Cómo funciona

```
Jellyfin:  car browser ──► Jellyfin web app + plugin script
                              └─► /BackseatFin/play ◄── Jellyfin's HLS transcode (H.264)

Emby:      car browser ──► car host (nginx) ──► Emby web app + inject.js
                              └─► /car/play ◄── BackseatFin server (ffmpeg, H.264 over WebSocket)
```

Al pulsar Reproducir se abre el reproductor sobre la página del servidor. Decodifica
el stream H.264 con el decodificador de hardware del coche (WebCodecs) y lo dibuja en
un canvas. Los detalles para colaboradores están en [AGENTS.md](AGENTS.md) y
[docs/player.md](docs/player.md).

## Hoja de ruta

- [x] Emby, a través del car host (inyección por proxy inverso)
- [x] Plugin de Jellyfin, que reproduce el propio HLS de Jellyfin (sin servidor
      adicional)
- [x] Mapeo tonal de HDR / Dolby Vision (GPU Intel, CPU)
- [x] Listas de reproducción de YouTube → biblioteca de Emby
- [ ] Interfaz de YouTube: seguir canales, descargar o transmitir directamente
- [ ] GPUs de NVIDIA y AMD

## Licencia

[MIT](LICENSE), excepto el plugin de Jellyfin en `jellyfin-plugin/`, que es
[GPLv3](jellyfin-plugin/LICENSE) porque enlaza con Jellyfin. Incluye
[JSMpeg](https://github.com/phoboslab/jsmpeg) (MIT) y usa
[Media Chrome](https://github.com/muxinc/media-chrome) (MIT).

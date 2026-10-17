<div align="center">

# BackseatFin

**Mira tu biblioteca de Jellyfin o Emby, y YouTube, en el navegador del coche, incluso mientras el coche está en movimiento.**

[![CI](https://github.com/jiaton/backseatfin/actions/workflows/ci.yml/badge.svg)](https://github.com/jiaton/backseatfin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jiaton/backseatfin?include_prereleases)](https://github.com/jiaton/backseatfin/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Emby](https://img.shields.io/badge/Emby-supported-52b54b)](https://emby.media)
[![Jellyfin](https://img.shields.io/badge/Jellyfin-plugin-aa5cc3)](docs/jellyfin.md)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-2496ed?logo=docker&logoColor=white)](https://github.com/jiaton?tab=packages&repo_name=backseatfin)

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · Español · [Deutsch](README.de.md)

Este documento es una traducción del README en inglés; el README en inglés es la versión autorizada.

</div>

![Captura del reproductor](docs/images/player.jpg)

<sub>Captura: [Sintel](https://durian.blender.org/) © Blender Foundation, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).</sub>

Los navegadores de coche como el de Tesla detienen `<video>` mientras se conduce, pero
siguen dibujando `<canvas>`. BackseatFin es un reproductor canvas para el coche, en tres
partes; usa las que necesites:

| Lo que ves | Lo que instalas | Servidor | Guía |
|---|---|---|---|
| **Jellyfin** | un plugin de Jellyfin | ninguno: Jellyfin transcodifica | [docs/jellyfin.md](docs/jellyfin.md) |
| **Emby** | unas líneas en tu nginx o Caddy, o nuestro pequeño contenedor | ninguno: Emby transcodifica (opcional para HDR) | [docs/emby.md](docs/emby.md) |
| **YouTube** | el servidor y la app de BackseatFin (Docker) | sí: los vídeos pasan por él | [docs/youtube.md](docs/youtube.md) |

- **La propia web de tu servidor multimedia.** Abre Jellyfin o Emby en el coche, navega
  como siempre y pulsa Reproducir. La búsqueda, las pistas de audio, los subtítulos
  (incluido PGS), los puntos de reanudación y el estado de "visto" se sincronizan con el
  servidor, y el reproductor usa tu propia sesión.
- **YouTube, autoalojado.** Busca, sigue canales y listas y continúa donde lo dejaste, en
  una pantalla pensada para el coche. Los vídeos pasan por tu propio servidor tal como
  YouTube los codificó (sin recodificar). Sin cuenta de Google, y tu historial se queda
  contigo. Añade vídeos a una lista de YouTube en el móvil y aparecerán en el coche.
- **Ligero para el coche.** Usa el decodificador de hardware H.264 del coche mediante
  WebCodecs, con JSMpeg como alternativa. La transmisión se ajusta a la pantalla y
  resiste las zonas sin señal.
- **HDR y Dolby Vision** se mapean tonalmente (Jellyfin: por Jellyfin; Emby: por el
  servidor opcional de BackseatFin, con una GPU Intel o la CPU).

> [!WARNING]
> Para pasajeros. El conductor debe mantener la vista en la carretera. Ver vídeos
> mientras se conduce es peligroso e ilegal en la mayoría de los lugares.

## Inicio rápido

**Jellyfin** (12.0+): añade el repositorio de plugins
`https://jiaton.github.io/backseatfin/jellyfin/manifest.json` en Dashboard → Plugins →
Repositories, instala **BackseatFin**, reinicia y elige qué navegadores usan el
reproductor del coche. Guía: [docs/jellyfin.md](docs/jellyfin.md).

**Emby**: añade el reproductor a tu propio nginx o Caddy (descarga un zip y añade unas
líneas) o usa nuestro contenedor. Las tres formas: [docs/emby.md](docs/emby.md).

**YouTube** (y el contenedor de Emby) funcionan con Docker Compose:

```sh
git clone https://github.com/jiaton/backseatfin.git && cd backseatfin
cp .env.example .env
# Emby:    pon EMBY_URL
# YouTube: descomenta COMPOSE_PROFILES=server (entra con el código del registro)
docker compose up -d
```

Después, pon detrás de HTTPS cada puerto que uses ([ejemplos](docs/reverse-proxy.md)) y
ábrelo en el coche. Guías: [docs/emby.md](docs/emby.md), [docs/youtube.md](docs/youtube.md).

## Cómo funciona

```
Jellyfin:  car browser ──► Jellyfin web app + plugin script
                              └─► /BackseatFin/play ◄── Jellyfin's HLS transcode (H.264)

Emby:      car browser ──► car host (nginx) ──► Emby web app + inject.js
                              └─► /car/play ◄── Emby's HLS transcode (H.264)
                                            ◄── optional BackseatFin server (HDR)

YouTube:   car browser ──► BackseatFin app (search, channels, history)
                              └─► /play ◄── BackseatFin server ◄── YouTube's H.264, passed through
```

Al pulsar Reproducir se abre el reproductor sobre la página del servidor. Decodifica
el stream H.264 con el decodificador de hardware del coche (WebCodecs) y lo dibuja en
un canvas. Los detalles para colaboradores están en [AGENTS.md](AGENTS.md) y
[docs/player.md](docs/player.md).

## Hoja de ruta

- [x] Emby, a través del car host (inyección por proxy inverso), con el HLS de Emby
- [x] Plugin de Jellyfin, que reproduce el propio HLS de Jellyfin (sin servidor
      adicional)
- [x] Mapeo tonal de HDR / Dolby Vision (GPU Intel, CPU)
- [x] YouTube en el coche: buscar, seguir canales, reproducir en directo, continuar
- [x] Listas seguidas; subtítulos; directos
- [ ] GPUs de NVIDIA y AMD para HDR (se agradecen contribuciones: no tenemos ese hardware para probar)

## Licencia

[MIT](LICENSE), excepto el plugin de Jellyfin en `jellyfin-plugin/`, que es
[GPLv3](jellyfin-plugin/LICENSE) porque enlaza con Jellyfin. Incluye
[JSMpeg](https://github.com/phoboslab/jsmpeg) (MIT) y usa
[Media Chrome](https://github.com/muxinc/media-chrome) (MIT).

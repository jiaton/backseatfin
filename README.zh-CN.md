<div align="center">

<img src="docs/images/logo.svg" alt="" width="96">

# BackseatFin

**即使车辆在行驶中，也能在车载浏览器里看你的 Jellyfin、Emby 媒体库和 YouTube。**

[![CI](https://github.com/jiaton/backseatfin/actions/workflows/ci.yml/badge.svg)](https://github.com/jiaton/backseatfin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jiaton/backseatfin?include_prereleases)](https://github.com/jiaton/backseatfin/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Emby](https://img.shields.io/badge/Emby-supported-52b54b)](https://emby.media)
[![Jellyfin](https://img.shields.io/badge/Jellyfin-plugin-aa5cc3)](docs/jellyfin.md)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-2496ed?logo=docker&logoColor=white)](https://github.com/jiaton?tab=packages&repo_name=backseatfin)

[English](README.md) · 简体中文 · [日本語](README.ja.md) · [Español](README.es.md) · [Deutsch](README.de.md)

本文由英文版翻译而来，以英文版为准。

</div>

![车载播放器截图](docs/images/player.jpg)

<sub>截图画面：[Sintel](https://durian.blender.org/) © Blender Foundation，[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)。</sub>

车机浏览器（比如特斯拉的）在行驶中会禁止 `<video>` 播放，但 `<canvas>` 照常绘制。BackseatFin 就是一个给车机用的 canvas 播放器，分成三部分，按需选用：

| 你看的是 | 需要安装 | 服务器 | 指南 |
|---|---|---|---|
| **Jellyfin** | 一个 Jellyfin 插件 | 不需要：Jellyfin 负责转码 | [docs/jellyfin.md](docs/jellyfin.md) |
| **Emby** | 在你的 nginx 或 Caddy 里加几行，或用我们的小容器 | 不需要：Emby 负责转码（HDR 可选用服务器） | [docs/emby.md](docs/emby.md) |
| **YouTube** | BackseatFin 服务器和应用（Docker） | 需要：视频经它转发 | [docs/youtube.md](docs/youtube.md) |

- **就用你媒体服务器自己的网页。** 在车里打开 Jellyfin 或 Emby，照常浏览，点播放。跳转进度、音轨、字幕（包括 PGS）、续播位置和"已观看"状态都会与服务器同步，播放器用的是你自己的登录。
- **自托管的 YouTube。** 在专为车机设计的界面上搜索、关注频道和播放列表，从上次停下的地方继续看。视频经你自己的服务器原样转发（不重新编码），不需要谷歌账号，观看记录留在你自己手里。在手机上把视频加进 YouTube 播放列表，车机首页就会出现。
- **对车机负担小。** 通过 WebCodecs 使用车机的硬件 H.264 解码器（YouTube 不支持时可回退到 JSMpeg）。视频流按屏幕尺寸调整，并能挺过信号盲区。
- **HDR 和杜比视界** 会做色调映射（Jellyfin：由 Jellyfin 完成；Emby：由可选的 BackseatFin 服务器完成，使用 Intel GPU 或 CPU）。

> [!WARNING]
> 仅供乘客使用。驾驶员必须专心看路。在驾驶过程中观看视频是危险行为，在大多数地区也属违法。

## 快速开始

**Jellyfin**（12.0 及以上）：在 Dashboard → Plugins → Manage Repositories 中添加插件仓库 `https://jiaton.github.io/backseatfin/jellyfin/manifest.json`，在 Available 里安装 **BackseatFin**，重启，然后选择哪些浏览器使用车机播放器。指南见 [docs/jellyfin.md](docs/jellyfin.md)。

**Emby**：在你自己的 nginx 或 Caddy 里加上播放器（下载一个 zip，加几行配置），或者用我们的容器。三种方式见 [docs/emby.md](docs/emby.md)。

**YouTube**（以及 Emby 的容器方式）用 Docker Compose：

```sh
git clone https://github.com/jiaton/backseatfin.git && cd backseatfin
cp .env.example .env
# Emby：    取消 EMBY_URL 的注释并填写
# YouTube： 取消注释 COMPOSE_PROFILES=server（用日志里的设置码登录）
docker compose pull && docker compose up -d
```

然后把用到的端口放到 HTTPS 之后（[示例](docs/reverse-proxy.md)），在车里打开即可。指南：[docs/emby.md](docs/emby.md)、[docs/youtube.md](docs/youtube.md)。

## 工作原理

```
Jellyfin:  car browser ──► Jellyfin web app + plugin script
                              └─► /BackseatFin/play ◄── Jellyfin's HLS transcode (H.264)

Emby:      car browser ──► car host (nginx) ──► Emby web app + inject.js
                              └─► /car/play ◄── Emby's HLS transcode (H.264)
                                            ◄── optional BackseatFin server (HDR)

YouTube:   car browser ──► BackseatFin app (search, channels, history)
                              └─► /play ◄── BackseatFin server ◄── YouTube's H.264, passed through
```

按下播放后，播放器会覆盖在服务器页面之上打开。它使用车机的硬件解码器（WebCodecs）解码 H.264 视频流，并将其绘制到 canvas 上。面向贡献者的详细说明见 [AGENTS.md](AGENTS.md) 和 [docs/player.md](docs/player.md)。

## 路线图

- [x] Emby，通过 car host（反向代理注入），播放 Emby 自己的 HLS
- [x] Jellyfin 插件，播放 Jellyfin 自己的 HLS（无需额外服务器）
- [x] HDR / 杜比视界色调映射（Intel GPU、CPU）
- [x] 车机里看 YouTube：搜索、关注频道、实时播放、续播
- [x] 播放列表连续播放；字幕；直播
- [ ] HDR 支持 NVIDIA 和 AMD 显卡（欢迎贡献：我们没有这些硬件可供测试）

## 许可证

[MIT](LICENSE)，除了 `jellyfin-plugin/` 中的 Jellyfin 插件，因为它链接到 Jellyfin，所以使用 [GPLv3](jellyfin-plugin/LICENSE) 许可。内置了 [JSMpeg](https://github.com/phoboslab/jsmpeg)（MIT），并使用了 [Media Chrome](https://github.com/muxinc/media-chrome)（MIT）。

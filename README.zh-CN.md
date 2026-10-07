<div align="center">

# BackseatFin

**即使车辆在行驶中，也能在车载浏览器里观看你自己的 Jellyfin 或 Emby 媒体库。**

[![CI](https://github.com/jiaton/backseatfin/actions/workflows/ci.yml/badge.svg)](https://github.com/jiaton/backseatfin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jiaton/backseatfin?include_prereleases)](https://github.com/jiaton/backseatfin/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Emby](https://img.shields.io/badge/Emby-supported-52b54b)](https://emby.media)
[![Jellyfin](https://img.shields.io/badge/Jellyfin-plugin-aa5cc3)](docs/jellyfin.md)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-2496ed?logo=docker&logoColor=white)](https://github.com/jiaton?tab=packages&repo_name=backseatfin)

[English](README.md) · 简体中文 · [日本語](README.ja.md) · [Español](README.es.md) · [Deutsch](README.de.md)

本文由英文版翻译而来，以英文版为准。

</div>

像特斯拉这样的车载浏览器在行驶时会停止播放 `<video>`，但仍会持续绘制 `<canvas>`。BackseatFin 为你的媒体服务器自带的网页应用添加了一个 canvas 播放器：在车里打开 Jellyfin 或 Emby，按下播放，视频就能播放。

- **Jellyfin：只需一个插件。** 无需额外的服务器，转码由 Jellyfin 完成。
- **你的媒体库，你的服务器。** 跳转进度、音轨、字幕（包括 PGS）、续播位置和"已观看"状态都会与服务器同步。
- **对车机负担小。** 它通过 WebCodecs 使用车机的硬件 H.264 解码器，若不支持则回退到 JSMpeg。视频流会按屏幕尺寸调整，并能挺过信号盲区。
- **HDR 和杜比视界** 会被进行色调映射（Emby：由 BackseatFin 的服务器完成，使用 Intel GPU 或 CPU；Jellyfin：由 Jellyfin 自己完成）。
- **脱离平台看 YouTube**（可选，仅 Emby）：关注播放列表，下载到自己的硬盘，在 Emby 中观看。无需账号，无需付费，数据始终留在自己手中。

> [!WARNING]
> 仅供乘客使用。驾驶员必须专心看路。在驾驶过程中观看视频是危险行为，在大多数地区也属违法。

## 快速开始

**Jellyfin**（12.0 及以上）：在 Dashboard → Plugins → Repositories 中添加插件仓库 `https://jiaton.github.io/backseatfin/jellyfin/manifest.json`，安装 **BackseatFin**，重启，然后选择哪些浏览器可以使用车载播放器。指南见 [docs/jellyfin.md](docs/jellyfin.md)。

**Emby**：在它旁边运行 BackseatFin 服务器。

```sh
git clone https://github.com/jiaton/backseatfin.git && cd backseatfin
cp .env.example .env   # set API_KEY and EMBY_URL
docker compose up -d
```

然后将两个端口放到 HTTPS 之后（[示例](docs/reverse-proxy.md)），并在车里打开 car host 地址。指南见 [docs/install.md](docs/install.md)。

## 工作原理

```
Jellyfin:  car browser ──► Jellyfin web app + plugin script
                              └─► /BackseatFin/play ◄── Jellyfin's HLS transcode (H.264)

Emby:      car browser ──► car host (nginx) ──► Emby web app + inject.js
                              └─► /car/play ◄── BackseatFin server (ffmpeg, H.264 over WebSocket)
```

按下播放后，播放器会覆盖在服务器页面之上打开。它使用车机的硬件解码器（WebCodecs）解码 H.264 视频流，并将其绘制到 canvas 上。面向贡献者的详细说明见 [AGENTS.md](AGENTS.md) 和 [docs/player.md](docs/player.md)。

## 路线图

- [x] Emby，通过 car host（反向代理注入）
- [x] Jellyfin 插件，播放 Jellyfin 自己的 HLS（无需额外服务器）
- [x] HDR / 杜比视界色调映射（Intel GPU、CPU）
- [x] YouTube 播放列表 → Emby 媒体库
- [ ] YouTube 界面：关注频道，直接下载或流式播放
- [ ] NVIDIA 和 AMD 显卡

## 许可证

[MIT](LICENSE)，除了 `jellyfin-plugin/` 中的 Jellyfin 插件，因为它链接到 Jellyfin，所以使用 [GPLv3](jellyfin-plugin/LICENSE) 许可。内置了 [JSMpeg](https://github.com/phoboslab/jsmpeg)（MIT），并使用了 [Media Chrome](https://github.com/muxinc/media-chrome)（MIT）。

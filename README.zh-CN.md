<div align="center">

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

像特斯拉这样的车载浏览器在行驶时会停止播放 `<video>`，但仍会持续绘制 `<canvas>`。BackseatFin 为你的媒体服务器自带的网页应用添加了一个 canvas 播放器：在车里打开 Jellyfin 或 Emby，按下播放，视频就能播放。

- **无需额外服务器。** Jellyfin：一个插件。Emby：一个小小的 nginx 容器。转码由你的媒体服务器完成，播放器使用你自己的登录。
- **你的媒体库，你的服务器。** 跳转进度、音轨、字幕（包括 PGS）、续播位置和"已观看"状态都会与服务器同步。
- **对车机负担小。** 它通过 WebCodecs 使用车机的硬件 H.264 解码器，若不支持则回退到 JSMpeg。视频流会按屏幕尺寸调整，并能挺过信号盲区。
- **HDR 和杜比视界** 会被进行色调映射（Jellyfin：由 Jellyfin 完成；Emby：由可选的 BackseatFin 服务器完成，使用 Intel GPU 或 CPU）。
- **自托管的 YouTube。** 在专为车机设计的界面上搜索、关注频道，从上次停下的地方继续看。视频经你自己的服务器原样转发（不重新编码），不需要谷歌账号，观看记录留在你自己手里。也可以下载到 Emby。

> [!WARNING]
> 仅供乘客使用。驾驶员必须专心看路。在驾驶过程中观看视频是危险行为，在大多数地区也属违法。

## 快速开始

**Jellyfin**（12.0 及以上）：在 Dashboard → Plugins → Repositories 中添加插件仓库 `https://jiaton.github.io/backseatfin/jellyfin/manifest.json`，安装 **BackseatFin**，重启，然后选择哪些浏览器可以使用车载播放器。指南见 [docs/jellyfin.md](docs/jellyfin.md)。

**YouTube 和 Emby**：用 Docker 运行 BackseatFin。

```sh
git clone https://github.com/jiaton/backseatfin.git && cd backseatfin
cp .env.example .env   # 填 API_KEY（YouTube）和/或 EMBY_URL（Emby）
docker compose up -d
```

然后放到 HTTPS 之后（[示例](docs/reverse-proxy.md)），在车里打开即可。指南见 [docs/install.md](docs/install.md)。

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
- [x] YouTube 播放列表 → Emby 媒体库
- [x] 车机里看 YouTube：搜索、关注频道、实时播放、续播
- [ ] 从手机发送视频到车机；播放列表连续播放；字幕；直播
- [ ] NVIDIA 和 AMD 显卡

## 许可证

[MIT](LICENSE)，除了 `jellyfin-plugin/` 中的 Jellyfin 插件，因为它链接到 Jellyfin，所以使用 [GPLv3](jellyfin-plugin/LICENSE) 许可。内置了 [JSMpeg](https://github.com/phoboslab/jsmpeg)（MIT），并使用了 [Media Chrome](https://github.com/muxinc/media-chrome)（MIT）。

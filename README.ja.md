<div align="center">

# BackseatFin

**車が走行中でも、車内のブラウザで自分の Emby ライブラリを視聴できます。**

[![CI](https://github.com/jiaton/backseatfin/actions/workflows/ci.yml/badge.svg)](https://github.com/jiaton/backseatfin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jiaton/backseatfin?include_prereleases)](https://github.com/jiaton/backseatfin/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Emby](https://img.shields.io/badge/Emby-supported-52b54b)](https://emby.media)
[![Jellyfin](https://img.shields.io/badge/Jellyfin-planned-aa5cc3)](#roadmap)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-2496ed?logo=docker&logoColor=white)](https://github.com/jiaton?tab=packages&repo_name=backseatfin)

[English](README.md) · [简体中文](README.zh-CN.md) · 日本語 · [Español](README.es.md) · [Deutsch](README.de.md)

このドキュメントは英語版を翻訳したものです。内容は英語版が正本です。

</div>

Tesla などの車載ブラウザは走行中に `<video>` を停止しますが、`<canvas>` の描画は継続します。BackseatFin は Emby 自身の Web アプリに canvas プレーヤーを追加します。車内で Emby を開き、再生ボタンを押すだけで再生されます。

- **自分のライブラリ、自分のサーバー。** シーク、音声トラック、字幕（PGS を含む）、再生位置の再開、「視聴済み」のステータスはすべて Emby と同期します。
- **車への負荷が小さい。** WebCodecs 経由で車のハードウェア H.264 デコーダーを使用し、対応していない場合は JSMpeg にフォールバックします。ストリームは画面サイズに合わせて調整され、通信の途切れも乗り越えます。
- **HDR と Dolby Vision** はサーバー側で、Intel GPU または CPU を使ってトーンマッピングされます。
- **プラットフォームを介さない YouTube**（任意機能）：プレイリストをフォローし、自分のディスクにダウンロードして Emby で視聴します。アカウント登録も料金も不要で、データは自分の手元に残ります。

> [!WARNING]
> 同乗者向けの機能です。運転者は必ず前方を注視してください。運転中に動画を視聴することは危険であり、多くの地域で違法です。

## クイックスタート

```sh
git clone https://github.com/jiaton/backseatfin.git && cd backseatfin
cp .env.example .env   # set API_KEY and EMBY_URL
docker compose up -d
```

その後、2 つのポートを HTTPS の背後に置き（[例](docs/reverse-proxy.md)）、車内で car host を開いてください。詳しいガイドは [docs/install.md](docs/install.md) を参照してください。

## 動作の仕組み

```
Car browser ──► car host (nginx) ──► Emby web app + inject.js
                    │
                    └──► /car/play ──► BackseatFin server ──► ffmpeg ──► Emby file
                         canvas player ◄── H.264 over WebSocket
```

Emby で再生ボタンを押すと、プレーヤーが Emby のページの上に開きます。サーバーは ffmpeg でファイルをトランスコードしてプレーヤーにストリーミングし、プレーヤーはそれを canvas にデコードします。コントリビューター向けの詳細は [AGENTS.md](AGENTS.md) と [docs/player.md](docs/player.md) にあります。

## ロードマップ

- [x] Emby（car host 経由、リバースプロキシによる注入）
- [x] HDR / Dolby Vision トーンマッピング（Intel GPU、CPU）
- [x] YouTube プレイリスト → Emby ライブラリ
- [ ] メディアサーバー自体の HLS を再生し、プレーヤーがサーバーなしでも動作するようにする
- [ ] Jellyfin プラグイン
- [ ] YouTube UI：チャンネルのフォロー、直接ダウンロードまたはストリーミング
- [ ] NVIDIA および AMD の GPU

## ライセンス

[MIT](LICENSE)。[JSMpeg](https://github.com/phoboslab/jsmpeg)（MIT）を内蔵し、
[Media Chrome](https://github.com/muxinc/media-chrome)（MIT）を使用しています。

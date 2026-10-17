<div align="center">

# BackseatFin

**車が走行中でも、車内のブラウザで Jellyfin・Emby のライブラリと YouTube を視聴できます。**

[![CI](https://github.com/jiaton/backseatfin/actions/workflows/ci.yml/badge.svg)](https://github.com/jiaton/backseatfin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jiaton/backseatfin?include_prereleases)](https://github.com/jiaton/backseatfin/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Emby](https://img.shields.io/badge/Emby-supported-52b54b)](https://emby.media)
[![Jellyfin](https://img.shields.io/badge/Jellyfin-plugin-aa5cc3)](docs/jellyfin.md)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-2496ed?logo=docker&logoColor=white)](https://github.com/jiaton?tab=packages&repo_name=backseatfin)

[English](README.md) · [简体中文](README.zh-CN.md) · 日本語 · [Español](README.es.md) · [Deutsch](README.de.md)

このドキュメントは英語版を翻訳したものです。内容は英語版が正本です。

</div>

![車載プレーヤーのスクリーンショット](docs/images/player.jpg)

<sub>スクリーンショット：[Sintel](https://durian.blender.org/) © Blender Foundation、[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)。</sub>

テスラなどの車載ブラウザは走行中に `<video>` を止めますが、`<canvas>` の描画は続けます。BackseatFin は車向けの canvas プレーヤーで、3 つの部分からなります。必要なものだけ使ってください：

| 見るもの | インストールするもの | サーバー | ガイド |
|---|---|---|---|
| **Jellyfin** | Jellyfin プラグイン | 不要：Jellyfin がトランスコード | [docs/jellyfin.md](docs/jellyfin.md) |
| **Emby** | 既存の nginx / Caddy に数行追加、または小さなコンテナ | 不要：Emby がトランスコード（HDR には任意で使用） | [docs/emby.md](docs/emby.md) |
| **YouTube** | BackseatFin サーバーとアプリ（Docker） | 必要：動画はサーバーを経由 | [docs/youtube.md](docs/youtube.md) |

- **メディアサーバー自身の Web アプリをそのまま使用。** 車で Jellyfin や Emby を開き、いつも通り選んで再生。シーク、音声トラック、字幕（PGS を含む）、再開位置、「視聴済み」はサーバーと同期し、プレーヤーは自分のログインを使います。
- **セルフホストの YouTube。** 車向けの画面で検索し、チャンネルや再生リストをフォローし、止めたところから続きを見られます。動画は自分のサーバーを YouTube のエンコードのまま通り（再エンコードなし）、Google アカウントは不要で、視聴履歴は手元に残ります。スマホで YouTube の再生リストに動画を追加すると、車のホーム画面に表示されます。
- **車への負荷が小さい。** WebCodecs 経由で車のハードウェア H.264 デコーダーを使い、使えない場合は JSMpeg にフォールバックします。ストリームは画面サイズに合わせられ、通信の途切れも乗り越えます。
- **HDR と Dolby Vision** はトーンマッピングされます（Jellyfin：Jellyfin 自身／Emby：オプションの BackseatFin サーバーが Intel GPU または CPU で）。

> [!WARNING]
> 同乗者向けの機能です。運転者は必ず前方を注視してください。運転中に動画を視聴することは危険であり、多くの地域で違法です。

## クイックスタート

**Jellyfin**（12.0 以降）：Dashboard → Plugins → Repositories でプラグインリポジトリ `https://jiaton.github.io/backseatfin/jellyfin/manifest.json` を追加し、**BackseatFin** をインストールして再起動し、車のプレーヤーを使うブラウザを選びます。ガイド：[docs/jellyfin.md](docs/jellyfin.md)。

**Emby**：既存の nginx や Caddy にプレーヤーを追加（zip をダウンロードして数行追加）するか、コンテナを使います。3 つの方法は [docs/emby.md](docs/emby.md)。

**YouTube**（と Emby のコンテナ方式）は Docker Compose で動きます：

```sh
git clone https://github.com/jiaton/backseatfin.git && cd backseatfin
cp .env.example .env
# Emby:    EMBY_URL を設定
# YouTube: COMPOSE_PROFILES=server のコメントを外す（ログのセットアップコードでログイン）
docker compose up -d
```

使うポートを HTTPS の背後に置き（[例](docs/reverse-proxy.md)）、車で開いてください。ガイド：[docs/emby.md](docs/emby.md)、[docs/youtube.md](docs/youtube.md)。

## 動作の仕組み

```
Jellyfin:  car browser ──► Jellyfin web app + plugin script
                              └─► /BackseatFin/play ◄── Jellyfin's HLS transcode (H.264)

Emby:      car browser ──► car host (nginx) ──► Emby web app + inject.js
                              └─► /car/play ◄── Emby's HLS transcode (H.264)
                                            ◄── optional BackseatFin server (HDR)

YouTube:   car browser ──► BackseatFin app (search, channels, history)
                              └─► /play ◄── BackseatFin server ◄── YouTube's H.264, passed through
```

再生ボタンを押すと、プレーヤーがサーバーのページの上に開きます。車のハードウェアデコーダー（WebCodecs）で H.264 ストリームをデコードし、canvas に描画します。コントリビューター向けの詳細は [AGENTS.md](AGENTS.md) と [docs/player.md](docs/player.md) にあります。

## ロードマップ

- [x] Emby（car host 経由、リバースプロキシによる注入、Emby 自身の HLS を再生）
- [x] Jellyfin プラグイン、Jellyfin 自身の HLS を再生（追加サーバー不要）
- [x] HDR / Dolby Vision トーンマッピング（Intel GPU、CPU）
- [x] 車で YouTube：検索、チャンネルのフォロー、ライブ再生、続きから再生
- [x] 再生リストの連続再生、字幕、ライブ配信
- [ ] HDR 向けの NVIDIA / AMD GPU 対応（コントリビュート歓迎：テストできるハードウェアがありません）

## ライセンス

[MIT](LICENSE)。ただし `jellyfin-plugin/` 内の Jellyfin プラグインは Jellyfin にリンクしているため [GPLv3](jellyfin-plugin/LICENSE) です。[JSMpeg](https://github.com/phoboslab/jsmpeg)（MIT）を内蔵し、[Media Chrome](https://github.com/muxinc/media-chrome)（MIT）を使用しています。

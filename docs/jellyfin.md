# Jellyfin

On Jellyfin, BackseatFin is just a plugin: no other server or container. Jellyfin does the
transcoding (including burning in picture subtitles and tone-mapping HDR, if you've set that up in
Jellyfin), and the plugin's player draws the result on a canvas in the car.

Needs Jellyfin 12.0 or later, reached over HTTPS (the player uses WebCodecs, which browsers
only allow on secure pages).

## 1. Install the plugin

1. In Jellyfin: **Dashboard → Plugins → Manage Repositories → New Repository**. Name it
   `BackseatFin`, with the URL
   `https://jiaton.github.io/backseatfin/jellyfin/manifest.json`, and **Add**.
2. Back on **Plugins**, choose **Available** (or search), open **BackseatFin** and
   **Install**, confirm the third-party notice, then restart Jellyfin (**Dashboard →
   Restart**).

## 2. Choose which browsers get the car player

The plugin never changes playback in a browser unless you tell it to. Pick one:

**A car-only hostname** (recommended if you run a reverse proxy). Point an extra hostname at
Jellyfin, for example `car.example.com`, and enter it in **Dashboard → Plugins → BackseatFin
→ Settings → Car-only hostnames**, then **Save**. Every browser that opens Jellyfin on that
hostname gets the car player; your usual address is unchanged.

```caddyfile
car.example.com {
    reverse_proxy 192.168.1.10:8096
}
```

The plugin tells the hostnames apart by the request's `Host` header: Caddy passes it on
by itself; in nginx, keep `proxy_set_header Host $host;` in the car hostname's server
block.

**Car mode per browser.** Leave the hostnames empty. In the car's browser, open
`https://<your jellyfin>/BackseatFin/car` once (with a base URL set in Jellyfin:
`/<base url>/BackseatFin/car`) and turn car mode on. Only that browser gets the car
player.

## 3. In the car

Open Jellyfin, sign in once, and browse as usual. Press Play and the car player opens; the
back arrow returns to where you were. Progress and "watched" sync with Jellyfin like any
other client.

The player's settings sheet has quality, audio track, subtitles and language. Quality is
capped to the screen: the stream is never sent larger than the window can show.

## How it works

- Jellyfin serves its web app with one extra `<script>` (added by the plugin as the page is
  served; nothing on disk changes). When Jellyfin's own player starts a video, the script
  opens `/BackseatFin/play` over the page instead.
- The player asks Jellyfin for an HLS transcode: H.264 + stereo AAC in MPEG-TS segments,
  sized to the screen, with picture subtitles (PGS, DVD) burned in; text subtitles are
  fetched as WebVTT and drawn by the player. It downloads segments one after
  another, demuxes them in JavaScript and decodes them with the car's hardware H.264 decoder
  (WebCodecs), drawing onto a canvas.
- Seeking asks Jellyfin for the segment at the new position; Jellyfin restarts its encoder
  there. Changing quality or tracks starts a new transcode and stops the old one.

## Troubleshooting

- **Play still opens Jellyfin's own player.** The browser isn't in car mode, or the
  hostname isn't in the plugin's list. Open `/BackseatFin/car` in that browser: it says
  which applies at that address.
- **"Open Jellyfin over HTTPS".** The page is on plain `http://`: browsers decode video
  for a page (WebCodecs) only on secure pages.
- **"This browser can't play Jellyfin streams here".** The browser has no hardware H.264
  decoder for WebCodecs.
- **Slow to start.** Jellyfin transcodes in real time; on a weak CPU, enable hardware
  acceleration in Jellyfin (Dashboard → Playback → Transcoding), or choose a lower quality.

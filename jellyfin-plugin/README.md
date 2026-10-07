# BackseatFin for Jellyfin

The Jellyfin plugin. It serves the BackseatFin car player at `/BackseatFin/` and adds its
hand-off script to Jellyfin's web app, so pressing Play in the car opens a player that
draws Jellyfin's own HLS transcode on a canvas. No other server is needed.

User guide: [../docs/jellyfin.md](../docs/jellyfin.md).

Licensed under the GPLv3 ([LICENSE](LICENSE)): the plugin links against Jellyfin's GPLv3
packages. The rest of BackseatFin, including the player it embeds, is MIT.

## Build

```sh
(cd ../frontend && npm ci && npm run build:jellyfin)   # the player, embedded into the DLL
dotnet test BackseatFin.slnx
dotnet build -c Release Jellyfin.Plugin.BackseatFin
```

Install by hand: copy `Jellyfin.Plugin.BackseatFin/bin/Release/net10.0/Jellyfin.Plugin.BackseatFin.dll`
into `<jellyfin config>/plugins/BackseatFin_<version>/` and restart Jellyfin.

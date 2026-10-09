// The car player for Jellyfin, served by the BackseatFin Jellyfin plugin
// (<jellyfin>/BackseatFin/play). No BackseatFin server: Jellyfin itself transcodes.
import { startPlayer } from './start'

void startPlayer('Jellyfin')

// The car player on the Emby car host (/car/play). Emby transcodes; the optional
// BackseatFin server, when it runs next to the car host, can do it instead.
import { startPlayer } from './start'

void startPlayer('Emby', { backend: true })

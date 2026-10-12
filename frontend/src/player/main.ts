// The car player (play.html): a YouTube video from our own app (?yt=…), or Emby on the
// car host (/car/play?item=…), where Emby transcodes and the optional BackseatFin server
// can do it instead.
import { startPlayer, startTube } from './start'

if (new URLSearchParams(window.location.search).has('yt')) void startTube()
else void startPlayer('Emby', { backend: true })

import { type JsmpegPlayer, loadJsmpeg } from './jsmpeg-loader'

import type { EngineCallbacks, StreamEngine } from './types'

/** MPEG-1/MP2 decoded in WebAssembly by JSMpeg: the fallback when WebCodecs can't play
 * H.264 + AAC. JSMpeg keeps audio and video in sync itself. */
export async function createJsmpegEngine(
  canvas: HTMLCanvasElement,
  url: string,
  cb: EngineCallbacks,
): Promise<StreamEngine> {
  const JSMpeg = await loadJsmpeg()
  let lastFrameAt = performance.now()
  let started = false
  let framesDrawn = 0
  const player: JsmpegPlayer = new JSMpeg.Player(url, {
    canvas,
    audio: true,
    video: true,
    autoplay: true,
    pauseWhenHidden: false,
    // JSMpeg's own reconnect would restart from the old offset; the player's watchdog
    // reconnects at the right position instead.
    reconnectInterval: 0,
    onVideoDecode: () => {
      lastFrameAt = performance.now()
      framesDrawn++
      if (!started) {
        started = true
        cb.onFirstFrame()
        cb.onAudioLocked(Boolean(player.audioOut && !player.audioOut.unlocked))
      }
    },
  })
  // Same "closed before the first frame" signal as the WebCodecs engine. JSMpeg keeps
  // its WebSocket on `source.socket` (not part of its typed surface).
  const socket = (player as unknown as { source?: { socket?: WebSocket } }).source?.socket
  socket?.addEventListener('close', (e) => {
    if (!started) cb.onError(e.reason || `connection closed (${e.code})`, e.reason ? 'connection' : 'network', e.code)
  })
  return {
    elapsed: () => {
      const t = player.currentTime
      return Number.isFinite(t) && t > 0 ? t : 0
    },
    lastFrameAt: () => lastFrameAt,
    unlockAudio: () => {
      const out = player.audioOut
      if (out && !out.unlocked) out.unlock(() => cb.onAudioLocked(false))
    },
    setVolume: (volume) => {
      player.volume = volume
    },
    stats: () => ({ framesDrawn, videoWidth: started ? canvas.width : 0, videoHeight: started ? canvas.height : 0 }),
    destroy: () => player.destroy(),
  }
}

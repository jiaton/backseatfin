import type { EngineCallbacks, StreamEngine } from './types'
import { createPipeline } from './webcodecs-pipeline'

/** While paused, the server keeps streaming (in real time) into our buffer; the stream
 * is closed — freeing the server's encoder — once the pause lasts this long… */
export const PAUSE_HOLD_MS = 60_000
/** …or this much is buffered ahead. Playing again after that reconnects. */
export const PAUSE_HOLD_AHEAD_S = 30
const HOLD_CHECK_MS = 1000

/** Our server's stream WebSocket (format=h264ts: no B-frames, a 2 s start burst) →
 * the WebCodecs pipeline. */
export function createWebCodecsEngine(canvas: HTMLCanvasElement, url: string, cb: EngineCallbacks): StreamEngine {
  let firstFrameShown = false
  let closed = false
  const pipeline = createPipeline(canvas, {
    ...cb,
    onFirstFrame: () => {
      firstFrameShown = true
      cb.onFirstFrame()
    },
  })
  const socket = new WebSocket(url)
  socket.binaryType = 'arraybuffer'
  socket.onmessage = (e) => pipeline.push(new Uint8Array(e.data as ArrayBuffer))
  // Closed before anything was shown = the stream never started (the server says why
  // in the close reason). Closing later is the end or a drop: the watchdog handles it.
  socket.onclose = (e) => {
    closed = true
    if (!firstFrameShown) pipeline.fail(e.reason || `connection closed (${e.code})`, e.reason ? 'connection' : 'network', e.code)
  }

  let holdTimer = 0
  let pausedAt = 0
  const pause = pipeline.pause!
  const resume = pipeline.resume!
  pipeline.pause = () => {
    pause()
    pausedAt = performance.now()
    window.clearInterval(holdTimer)
    holdTimer = window.setInterval(() => {
      if (performance.now() - pausedAt > PAUSE_HOLD_MS || pipeline.bufferedAhead() > PAUSE_HOLD_AHEAD_S) {
        window.clearInterval(holdTimer)
        closed = true
        socket.close()
      }
    }, HOLD_CHECK_MS)
  }
  // A stream closed during the pause would play its buffer and then stall: reconnect.
  pipeline.canResume = () => !closed
  pipeline.resume = () => {
    window.clearInterval(holdTimer)
    return resume()
  }
  pipeline.onDestroy = () => {
    window.clearInterval(holdTimer)
    socket.close()
  }
  return pipeline
}

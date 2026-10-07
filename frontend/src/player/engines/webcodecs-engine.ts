import type { EngineCallbacks, StreamEngine } from './types'
import { createPipeline } from './webcodecs-pipeline'

/** Our server's stream WebSocket (format=h264ts: no B-frames, a 2 s start burst) →
 * the WebCodecs pipeline. */
export function createWebCodecsEngine(canvas: HTMLCanvasElement, url: string, cb: EngineCallbacks): StreamEngine {
  let firstFrameShown = false
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
    if (!firstFrameShown) pipeline.fail(e.reason || `connection closed (${e.code})`, e.reason ? 'connection' : 'network', e.code)
  }
  pipeline.onDestroy = () => socket.close()
  return pipeline
}

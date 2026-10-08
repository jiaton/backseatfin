import type { EngineCallbacks, StreamEngine } from './types'
import { createPipeline } from './webcodecs-pipeline'

/** While paused, the server keeps streaming (in real time) into our buffer; the stream
 * is closed — freeing the server's encoder — once the pause lasts this long… */
export const PAUSE_HOLD_MS = 60_000
/** …or this much is buffered ahead. */
export const PAUSE_HOLD_AHEAD_S = 30
/** After such a pause, playback continues from the buffer, and a new stream starting
 * where the buffer ends is opened once less than this is left. */
export const REFILL_AHEAD_S = 10
/** With less than this buffered, there's nothing to continue from: reconnect instead. */
const MIN_RESUME_S = 2
const CHECK_MS = 500

/** Our server's stream WebSocket (format=h264ts: no B-frames, a 2 s start burst) →
 * the WebCodecs pipeline. `url` carries the start (`t`, seconds) the server seeks to. */
export function createWebCodecsEngine(canvas: HTMLCanvasElement, url: string, cb: EngineCallbacks): StreamEngine {
  let firstFrameShown = false
  const pipeline = createPipeline(canvas, {
    ...cb,
    onFirstFrame: () => {
      firstFrameShown = true
      cb.onFirstFrame()
    },
  })
  const startSeconds = Number(new URL(url).searchParams.get('t') ?? 0)

  let socket: WebSocket | null = null
  let open = false // the current socket is (still) streaming to us
  const connect = (streamUrl: string, onClose: (e: CloseEvent) => void) => {
    const ws = new WebSocket(streamUrl)
    ws.binaryType = 'arraybuffer'
    ws.onmessage = (e) => pipeline.push(new Uint8Array(e.data as ArrayBuffer))
    ws.onclose = (e) => {
      if (ws !== socket) return
      open = false
      onClose(e)
    }
    socket = ws
    open = true
  }
  // Closed before anything was shown = the stream never started (the server says why
  // in the close reason). Closing later is the end or a drop: the watchdog handles it.
  connect(url, (e) => {
    if (!firstFrameShown) pipeline.fail(e.reason || `connection closed (${e.code})`, e.reason ? 'connection' : 'network', e.code)
  })
  const closeSocket = () => {
    open = false
    socket?.close()
  }

  /** Opens a stream at the end of what's buffered and splices it on, so playback runs
   * on without a gap. If it fails, the buffer runs out and the player reconnects. */
  const refill = () => {
    const range = pipeline.receivedRange()
    if (!range) return
    const cut = range.last // the newest frame is replaced by the new stream's keyframe
    const next = new URL(url)
    next.searchParams.set('t', (startSeconds + (cut - range.first)).toFixed(3))
    pipeline.spliceAt(cut)
    connect(next.href, () => {})
  }

  let timer = 0
  let pausedAt = 0
  const watch = (check: () => void) => {
    window.clearInterval(timer)
    timer = window.setInterval(check, CHECK_MS)
  }
  const pause = pipeline.pause!
  const resume = pipeline.resume!
  pipeline.pause = () => {
    pause()
    pausedAt = performance.now()
    watch(() => {
      if (open && (performance.now() - pausedAt > PAUSE_HOLD_MS || pipeline.bufferedAhead() > PAUSE_HOLD_AHEAD_S)) {
        window.clearInterval(timer)
        closeSocket()
      }
    })
  }
  // A stream still open, or enough buffered to play while a new one is opened.
  pipeline.canResume = () => open || pipeline.bufferedAhead() >= MIN_RESUME_S
  pipeline.resume = () => {
    window.clearInterval(timer)
    if (!resume()) return false
    if (!open) {
      watch(() => {
        if (pipeline.bufferedAhead() < REFILL_AHEAD_S) {
          window.clearInterval(timer)
          refill()
        }
      })
    }
    return true
  }
  pipeline.onDestroy = () => {
    window.clearInterval(timer)
    closeSocket()
  }
  return pipeline
}

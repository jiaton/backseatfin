import type { EngineCallbacks, StreamEngine } from './types'
import { createPipeline, type PipelineOptions } from './webcodecs-pipeline'

/** Flow control: the server sends as fast as it can (with flow=1 on the URL) until we
 * hold it at this much buffered… */
export const BUFFER_HIGH_S = 20
/** …and lets it go again below this. ~20 s rides out tunnels and dead zones. */
export const BUFFER_LOW_S = 15
/** No data for this long while we're expecting some = the connection is stuck (mobile
 * networks can stall without closing): reconnect without waiting for the buffer to run
 * out. */
export const DATA_STALL_MS = 5000
/** A fresh connection gets this long to deliver its first bytes. */
const CONNECT_GRACE_MS = 8000
/** While paused, the stream is kept (held by flow control) this long, then closed to
 * free the server's encoder. */
export const PAUSE_HOLD_MS = 60_000
/** Not connected while playing (after a long pause, or a stuck connection): a stream
 * starting where the buffer ends is opened once less than this is left… */
export const REFILL_AHEAD_S = 10
/** …retried this often while it fails. */
const RETRY_MS = 2000
/** With less than this buffered, there's nothing to continue from: reconnect instead. */
const MIN_RESUME_S = 2
const CHECK_MS = 500

/**
 * Our server's stream WebSocket (format=h264ts; B-frames only when YouTube's H.264 is
 * passed through, `opts.reorder`) → the WebCodecs pipeline.
 * `url` carries the start (`t`, seconds) the server seeks to. One long connection, kept
 * healthy here: flow control keeps BUFFER_LOW_S–BUFFER_HIGH_S buffered; a connection
 * that stops delivering is replaced by one that starts where the buffer ends and is
 * spliced on (no gap); after the server finishes the film, nothing is retried.
 */
export function createWebCodecsEngine(canvas: HTMLCanvasElement, url: string, cb: EngineCallbacks, opts: PipelineOptions = {}): StreamEngine {
  let firstFrameShown = false
  const pipeline = createPipeline(canvas, {
    ...cb,
    onFirstFrame: () => {
      firstFrameShown = true
      cb.onFirstFrame()
    },
  }, opts)
  const startSeconds = Number(new URL(url).searchParams.get('t') ?? 0)

  let socket: WebSocket | null = null
  let open = false // the current socket is (still) streaming to us
  let held = false // we told the server to hold
  let finished = false // the server sent the whole film
  let lastDataAt = performance.now()
  let pausedAt = 0
  let nextAttemptAt = 0
  let reconnects = 0
  let replaceNow = false // a stuck connection was dropped: reconnect without waiting

  const connect = (streamUrl: string, onFailedStart?: (e: CloseEvent) => void) => {
    const ws = new WebSocket(streamUrl)
    ws.binaryType = 'arraybuffer'
    let gotData = false
    ws.onmessage = (e) => {
      if (ws !== socket) return
      gotData = true
      replaceNow = false
      lastDataAt = performance.now()
      pipeline.push(new Uint8Array(e.data as ArrayBuffer))
    }
    ws.onclose = (e) => {
      if (ws !== socket) return
      open = false
      // A clean close after data = the server reached the end; anything else = a drop.
      if (e.code === 1000 && gotData) finished = true
      if (!gotData) onFailedStart?.(e)
    }
    socket = ws
    open = true
    held = false
    lastDataAt = performance.now() + CONNECT_GRACE_MS - DATA_STALL_MS
  }
  const closeSocket = () => {
    open = false
    held = false
    const ws = socket
    socket = null
    ws?.close()
  }
  const send = (message: string) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(message)
  }

  // Closed before anything was shown = the stream never started (the server says why
  // in the close reason).
  connect(url, (e) => {
    if (!firstFrameShown) pipeline.fail(e.reason || `connection closed (${e.code})`, e.reason ? 'connection' : 'network', e.code)
  })

  /** Opens a stream at the end of what's buffered and splices it on. */
  const refill = () => {
    const range = pipeline.receivedRange()
    if (!range) return
    const cut = range.last // the newest frame is replaced by the new stream's keyframe
    const next = new URL(url)
    next.searchParams.set('t', (startSeconds + (cut - range.first)).toFixed(3))
    pipeline.spliceAt(cut)
    reconnects++
    connect(next.href)
  }

  const tick = () => {
    const now = performance.now()
    const buffered = pipeline.bufferedAhead()
    if (open) {
      if (!held && buffered > BUFFER_HIGH_S) {
        send('hold')
        held = true
      } else if (held && !pipeline.paused && buffered < BUFFER_LOW_S) {
        send('go')
        held = false
        lastDataAt = now // nothing came while held: the stall clock starts now
      }
      if (pipeline.paused && now - pausedAt > PAUSE_HOLD_MS) closeSocket()
      else if (!pipeline.paused && !held && firstFrameShown && now - lastDataAt > DATA_STALL_MS) {
        closeSocket() // stuck: replace it now, before the buffer runs out
        replaceNow = true
        nextAttemptAt = 0
      }
    } else if (
      firstFrameShown &&
      !finished &&
      !pipeline.paused &&
      (replaceNow || buffered < REFILL_AHEAD_S) &&
      now >= nextAttemptAt
    ) {
      nextAttemptAt = now + RETRY_MS
      refill()
    }
  }
  const timer = window.setInterval(tick, CHECK_MS)

  const pause = pipeline.pause!
  pipeline.pause = () => {
    pause()
    pausedAt = performance.now()
  }
  // A stream still open, or enough buffered to play while a new one is opened.
  pipeline.canResume = () => open || finished || pipeline.bufferedAhead() >= MIN_RESUME_S
  const stats = pipeline.stats
  pipeline.stats = () => ({ ...stats(), reconnects, held })
  pipeline.onDestroy = () => {
    window.clearInterval(timer)
    closeSocket()
  }
  return pipeline
}

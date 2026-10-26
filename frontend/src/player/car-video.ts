import { createHlsEngine } from './engines/hls-engine'
import { createJsmpegEngine } from './engines/jsmpeg-engine'
import type { EngineCallbacks, EngineErrorKind, EngineKind, EngineStats, StreamEngine } from './engines/types'
import { createWebCodecsEngine } from './engines/webcodecs-engine'

/** What to play: a server-side transcoded stream that can start at any offset. Seeking,
 * and changing anything the URL encodes (tracks, quality), reconnects at the current
 * position. */
export interface CarVideoSource {
  /** URL of the stream starting at `startSeconds`, for this engine (a WebSocket URL,
   * or for `hls` a playlist URL). */
  url(startSeconds: number, engine: EngineKind): string
  /** Request headers for engines that fetch over HTTP (`hls`), e.g. the media server's
   * authorization. */
  headers?(): Record<string, string>
  /** The WebSocket stream may have B-frames (passed through from YouTube): the decoder
   * must reorder frames. Our own encodes never do. */
  reorder?: boolean
  /** Seconds; NaN if unknown. */
  duration: number
  /** Where playback starts (e.g. Emby's resume position). */
  start: number
}

/** Why playback stopped; the page turns this into words in the viewer's language.
 * decode: no engine can decode here. refused: the server closed the stream (closeCode
 * says how). timeout: no first frame in time. outage: the network stayed down. */
export type CarVideoErrorReason = 'decode' | 'refused' | 'timeout' | 'outage'

export interface CarVideoError {
  /** MediaError code: 2 network, 3 decode. */
  code: number
  reason: CarVideoErrorReason
  /** Technical detail (English). */
  message: string
  closeCode?: number
}

export type EngineFactory = (
  kind: EngineKind,
  canvas: HTMLCanvasElement,
  url: string,
  cb: EngineCallbacks,
  headers?: Record<string, string>,
  opts?: { reorder?: boolean },
) => Promise<StreamEngine>

export const defaultEngineFactory: EngineFactory = (kind, canvas, url, cb, headers, opts) => {
  if (kind === 'webcodecs') return Promise.resolve(createWebCodecsEngine(canvas, url, cb, opts))
  if (kind === 'hls') return Promise.resolve(createHlsEngine(canvas, url, cb, headers))
  return createJsmpegEngine(canvas, url, cb)
}

/** MediaError codes we use. */
const MEDIA_ERR_NETWORK = 2
const MEDIA_ERR_DECODE = 3

/** No new frame for this long while playing = the connection dropped (or the stream
 * ended): reconnect at the current position. */
export const STALL_MS = 4000
/** A stream that never shows a first frame is given up on after this long. */
export const START_TIMEOUT_MS = 20_000
/** Network outages (a tunnel, a dead zone): retry this often… */
export const RETRY_DELAY_MS = 2000
/** …with a shorter start timeout per attempt (a connect into a dead network can hang
 * rather than fail)… */
const RETRY_START_TIMEOUT_MS = 8000
/** …and only report an error once the outage has lasted this long. */
export const OUTAGE_GIVE_UP_MS = 90_000
/** A stall this close to the end is the end. */
const END_SLACK_S = 10
/** Seeks while playing open the new stream only after this long without another seek:
 * dragging the progress bar or tapping "+30 s" three times costs one server stream,
 * not one per step. */
export const SEEK_SETTLE_MS = 300
const TICK_MS = 250

// HTMLMediaElement readyState values.
const HAVE_NOTHING = 0
const HAVE_METADATA = 1
const HAVE_ENOUGH_DATA = 4

const STYLE = `
  :host { display: block; position: relative; background: black; overflow: hidden; contain: strict; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
`

/**
 * `<car-video>`: the car player as a media element. It exposes the subset of the
 * HTMLMediaElement API that media UIs drive (play/pause/currentTime/duration/volume/
 * seekable + the standard events), so any controls library can sit on top. Underneath,
 * a seek into what's buffered ahead or kept behind (the last 20 s played) just skips
 * there (`skipTo`); any other seek or
 * source change opens a fresh server stream at that position and decodes it onto a canvas — never a `<video>`, which the car blocks while driving.
 *
 * Self-healing: a stream that stops producing frames is resumed where it was; an
 * engine that can't decode here (WebCodecs) falls back to JSMpeg once.
 */
export class CarVideoElement extends HTMLElement {
  static engineFactory: EngineFactory = defaultEngineFactory

  #canvas: HTMLCanvasElement
  #canvasKind: EngineKind | null = null // a canvas keeps the first context type it got
  #source: CarVideoSource | null = null
  #engineKind: EngineKind = 'webcodecs'
  #engine: StreamEngine | null = null
  #generation = 0 // bumps on every (re)connect; stale engine callbacks are ignored
  #base = 0 // media time the current stream starts at
  #paused = true
  #ended = false
  #seeking = false
  #readyState = HAVE_NOTHING
  #volume = 1
  #muted = false
  #probing = false
  #error: CarVideoError | null = null
  #audioLocked = false
  #connectedAt = 0
  #ticker = 0
  #fellBack = false
  #settle = 0
  #connects = 0
  #outageSince: number | null = null
  #buffering = false

  constructor() {
    super()
    const root = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = STYLE
    this.#canvas = document.createElement('canvas')
    this.#canvas.setAttribute('part', 'canvas')
    root.append(style, this.#canvas)
  }

  disconnectedCallback() {
    this.#stopStream()
  }

  // --- source ------------------------------------------------------------------------

  get source(): CarVideoSource | null {
    return this.#source
  }

  set source(source: CarVideoSource | null) {
    this.#stopStream()
    this.#source = source
    this.#base = source?.start ?? 0
    this.#paused = true
    this.#ended = false
    this.#error = null
    this.#readyState = HAVE_NOTHING
    this.#emit('emptied')
    if (!source) return
    this.#emit('loadstart')
    this.#readyState = HAVE_METADATA
    this.#emit('durationchange')
    this.#emit('loadedmetadata')
    this.#emit('timeupdate')
  }

  /** Which engine to decode with; changing it while playing reconnects. */
  get engine(): EngineKind {
    return this.#engineKind
  }

  set engine(kind: EngineKind) {
    if (kind === this.#engineKind) return
    this.#engineKind = kind
    if (!this.#paused) this.#connect(this.currentTime)
    else this.#release()
  }

  /** Reopens the stream at the current position (after the source's URL changed, e.g. a
   * different audio track, subtitle or quality). */
  reload() {
    this.#error = null
    if (this.#paused) {
      this.#release() // a held stream has the old URL
      void this.play()
      return
    }
    this.#connect(this.currentTime)
  }

  // --- HTMLMediaElement surface -----------------------------------------------------

  get paused() {
    return this.#paused
  }

  get ended() {
    return this.#ended
  }

  get seeking() {
    return this.#seeking
  }

  /** Playing, but the clock is stopped waiting for data (the network is slower than the
   * stream). Like a `<video>` that runs dry: 'waiting' on the way in, 'playing' out. */
  get buffering() {
    return this.#buffering
  }

  get readyState() {
    return this.#readyState
  }

  get error() {
    return this.#error
  }

  get duration() {
    return this.#source?.duration ?? Number.NaN
  }

  get currentTime(): number {
    // A paused stream that's held (see pause()) reports its frozen position.
    const t = this.#engine ? this.#base + this.#engine.elapsed() : this.#base
    return Number.isFinite(this.duration) ? Math.min(t, this.duration) : t
  }

  set currentTime(value: number) {
    if (!this.#source || !Number.isFinite(value)) return
    const max = Number.isFinite(this.duration) ? Math.max(0, this.duration - 1) : Number.POSITIVE_INFINITY
    const target = Math.max(0, Math.min(value, max))
    this.#ended = false
    this.#seeking = true
    this.#emit('seeking')
    if (this.#paused) {
      this.#stopStream() // the held buffer is for the old position
      this.#base = target
      this.#seeking = false
      this.#emit('timeupdate')
      this.#emit('seeked')
    } else if (this.#engine?.skipTo?.(target - this.#base)) {
      // Into what's buffered ahead or kept behind (a "−15 s" tap): no new server stream.
      this.#seeking = false
      this.#emit('timeupdate')
      this.#emit('seeked')
    } else {
      this.#stopStream()
      this.#base = target
      this.#readyState = HAVE_METADATA
      this.#emit('waiting')
      this.#emit('timeupdate')
      this.#settle = window.setTimeout(() => this.#connect(this.#base), SEEK_SETTLE_MS)
    }
  }

  get seekable(): TimeRanges {
    return ranges(Number.isFinite(this.duration) ? [[0, this.duration]] : [])
  }

  /** Up to what's received ahead of the clock (the progress bar shows it). Starts where
   * this stream did, not at the clock: Media Chrome draws the range holding its own
   * last-known time, which lags ours a little. */
  get buffered(): TimeRanges {
    const ahead = this.#engine?.stats().bufferAheadS
    if (!ahead) return ranges([])
    const end = this.currentTime + ahead
    return ranges([[Math.min(this.#base, this.currentTime), Number.isFinite(this.duration) ? Math.min(end, this.duration) : end]])
  }

  get playbackRate() {
    return 1
  }

  get volume() {
    return this.#volume
  }

  set volume(v: number) {
    this.#volume = Math.max(0, Math.min(1, v))
    this.#applyVolume()
    this.#emit('volumechange')
  }

  get muted() {
    return this.#muted
  }

  set muted(m: boolean) {
    this.#muted = m
    this.#applyVolume()
    this.#emit('volumechange')
  }

  play(): Promise<void> {
    if (!this.#source) return Promise.reject(new DOMException('no source', 'NotSupportedError'))
    if (!this.#paused) return Promise.resolve()
    if (this.#ended) this.#base = 0
    this.#ended = false
    this.#paused = false
    this.#error = null
    this.#emit('play')
    // A held stream plays on from its buffer, at once and with no new request.
    if (this.#engine?.resume?.()) {
      this.#ticker = window.setInterval(() => this.#tick(), TICK_MS)
      this.#emit('playing')
      return Promise.resolve()
    }
    this.#release()
    this.#connect(this.#base)
    return Promise.resolve()
  }

  /** Pausing a playing stream that can hold (WebCodecs, HLS) freezes it in place and
   * keeps its buffer, so play() continues without reconnecting; anything else is
   * stopped and play() reconnects at the same position. */
  pause() {
    this.#outageSince = null
    if (this.#paused) return
    this.#paused = true
    const engine = this.#engine
    if (engine?.pause && this.#readyState === HAVE_ENOUGH_DATA) {
      engine.pause()
      window.clearInterval(this.#ticker)
      this.#ticker = 0
    } else {
      this.#release()
      this.#readyState = HAVE_METADATA
    }
    this.#emit('timeupdate')
    this.#emit('pause')
  }

  // --- extras ------------------------------------------------------------------------

  /** Pauses and lets go of the stream and its buffer (leaving the player). */
  stop() {
    this.pause()
    this.#release()
    this.#readyState = HAVE_METADATA
  }

  /** Size of the picture being played (0 before the first frame), as on <video>. */
  get videoWidth() {
    return this.#engine?.stats().videoWidth ?? 0
  }

  get videoHeight() {
    return this.#engine?.stats().videoHeight ?? 0
  }

  /** True while retrying through a network outage (fires 'retrying' / 'playing'). */
  get retrying() {
    return this.#outageSince != null
  }

  /** True while the browser holds sound back until a user gesture. */
  get audioLocked() {
    return this.#audioLocked
  }

  /** Call from a user gesture (any tap): starts sound if the browser held it back. */
  unlockAudio() {
    this.#engine?.unlockAudio()
  }

  /** true = buffer further ahead in longer bursts, to measure the network (see
   * StreamEngine.probe); kept across reconnects. */
  probe(on: boolean) {
    this.#probing = on
    this.#engine?.probe?.(on)
  }

  /** Diagnostics: the running engine's counters. */
  stats(): EngineStats & { engine: EngineKind; connects: number } {
    return { framesDrawn: 0, ...this.#engine?.stats(), engine: this.#engineKind, connects: this.#connects }
  }

  // --- internals ---------------------------------------------------------------------

  #emit(type: string) {
    this.dispatchEvent(new Event(type))
  }

  #applyVolume() {
    this.#engine?.setVolume(this.#muted ? 0 : this.#volume)
  }

  /** Stops the stream, keeping its position. */
  #release() {
    if (!this.#engine) return
    this.#base = this.currentTime
    this.#stopStream()
  }

  #stopStream() {
    this.#buffering = false
    window.clearTimeout(this.#settle)
    this.#generation++
    this.#engine?.destroy()
    this.#engine = null
    window.clearInterval(this.#ticker)
    this.#ticker = 0
  }

  #connect(at: number) {
    const source = this.#source
    if (!source) return
    this.#stopStream()
    const generation = this.#generation
    this.#base = at
    this.#connects++
    this.#readyState = HAVE_METADATA
    this.#connectedAt = performance.now()
    this.#emit('waiting')
    this.#emit('timeupdate')

    const live = () => generation === this.#generation
    const kind = this.#engineKind
    if (this.#canvasKind && (this.#canvasKind === 'jsmpeg') !== (kind === 'jsmpeg')) {
      // WebCodecs draws with 2D, JSMpeg with WebGL; a canvas can't switch.
      const fresh = document.createElement('canvas')
      fresh.setAttribute('part', 'canvas')
      this.#canvas.replaceWith(fresh)
      this.#canvas = fresh
    }
    this.#canvasKind = kind
    const callbacks: EngineCallbacks = {
      onFirstFrame: () => {
        if (!live()) return
        this.#outageSince = null
        this.#readyState = HAVE_ENOUGH_DATA
        if (this.#seeking) {
          this.#seeking = false
          this.#emit('seeked')
        }
        this.#emit('canplay')
        this.#emit('playing')
      },
      onError: (message, errorKind, closeCode) => {
        if (!live()) return
        this.#onEngineError(message, errorKind, kind, closeCode)
      },
      onAudioLocked: (locked) => {
        if (!live() || locked === this.#audioLocked) return
        this.#audioLocked = locked
        this.#emit('audiolockchange')
      },
    }
    CarVideoElement.engineFactory(kind, this.#canvas, source.url(at, kind), callbacks, source.headers?.(), { reorder: source.reorder }).then(
      (engine) => {
        if (!live()) return engine.destroy()
        this.#engine = engine
        this.#applyVolume()
        engine.probe?.(this.#probing)
      },
      (e: unknown) => callbacks.onError(e instanceof Error ? e.message : String(e), 'connection'),
    )
    this.#ticker = window.setInterval(() => this.#tick(), TICK_MS)
  }

  /** The network failed us: try again shortly, at the same position, until the outage
   * has gone on for OUTAGE_GIVE_UP_MS. */
  #retryAfterOutage(message: string) {
    const now = performance.now()
    this.#outageSince ??= now
    if (now - this.#outageSince > OUTAGE_GIVE_UP_MS) {
      this.#outageSince = null
      this.#fail({ code: MEDIA_ERR_NETWORK, reason: 'outage', message })
      return
    }
    const at = this.currentTime
    this.#stopStream()
    this.#base = at
    this.#readyState = HAVE_METADATA
    this.#emit('retrying')
    this.#emit('waiting')
    this.#settle = window.setTimeout(() => this.#connect(this.#base), RETRY_DELAY_MS)
  }

  #onEngineError(message: string, kind: EngineErrorKind, engine: EngineKind, closeCode?: number) {
    if (this.#paused) {
      // A held stream failed while paused: drop it; play() reconnects.
      this.#release()
      this.#readyState = HAVE_METADATA
      return
    }
    if (kind === 'network') {
      this.#retryAfterOutage(message)
      return
    }
    // The hardware path can't decode in this browser: fall back once, same position.
    if (kind === 'decode' && engine === 'webcodecs' && !this.#fellBack) {
      this.#fellBack = true
      this.#engineKind = 'jsmpeg'
      this.#emit('enginechange')
      this.#connect(this.currentTime)
      return
    }
    this.#fail(
      kind === 'decode'
        ? { code: MEDIA_ERR_DECODE, reason: 'decode', message }
        : { code: MEDIA_ERR_NETWORK, reason: 'refused', message, closeCode },
    )
  }

  #fail(error: CarVideoError) {
    this.#outageSince = null
    this.#base = this.currentTime
    this.#stopStream()
    this.#paused = true
    this.#seeking = false
    this.#readyState = HAVE_METADATA
    this.#error = error
    this.#emit('error')
    this.#emit('pause')
  }

  #tick() {
    if (this.#paused) return
    this.#emit('timeupdate')
    this.#emit('progress') // `buffered` moves with the clock
    const engine = this.#engine
    if (this.#readyState < HAVE_ENOUGH_DATA) {
      const waited = performance.now() - this.#connectedAt
      if (this.#outageSince != null && waited > RETRY_START_TIMEOUT_MS) this.#retryAfterOutage('connect timed out')
      else if (waited > START_TIMEOUT_MS) this.#fail({ code: MEDIA_ERR_NETWORK, reason: 'timeout', message: 'no first frame' })
      return
    }
    const buffering = Boolean(engine?.buffering?.())
    if (buffering !== this.#buffering) {
      this.#buffering = buffering
      this.#emit(buffering ? 'waiting' : 'playing')
    }
    if (!engine || performance.now() - engine.lastFrameAt() < STALL_MS) return
    // Stalled: the end of the film, or a dropped connection (4G) — resume in place.
    const position = this.currentTime
    if (Number.isFinite(this.duration) && position >= this.duration - END_SLACK_S) {
      this.#base = this.duration
      this.#stopStream()
      this.#paused = true
      this.#ended = true
      this.#emit('timeupdate')
      this.#emit('pause')
      this.#emit('ended')
    } else {
      this.#connect(position)
    }
  }
}

function ranges(list: [number, number][]): TimeRanges {
  return {
    length: list.length,
    start: (i: number) => list[i][0],
    end: (i: number) => list[i][1],
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'car-video': CarVideoElement
  }
}

export function defineCarVideo() {
  if (!customElements.get('car-video')) customElements.define('car-video', CarVideoElement)
}

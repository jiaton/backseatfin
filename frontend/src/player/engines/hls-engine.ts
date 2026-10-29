import { type Cue, parseSubtitles } from '../captions'
import { firstVariant, parseMediaPlaylist, type Segment, segmentAt, splitStart, subtitleRendition } from './hls'
import type { EngineCallbacks, EngineErrorKind, StreamEngine } from './types'
import { createPipeline, MEASURE_MIN_BYTES, MEASURE_MIN_MS, measured, PROBE_EXTRA_S, type Pipeline } from './webcodecs-pipeline'

/** Compressed video fetched ahead of the clock (about seven 3 s segments; 4–8 MB at
 * 1.5–3 Mbps). Rides out a mobile dead zone of that length, like the WebSocket engine's
 * BUFFER_HIGH_S; segments past it wait, so the car's memory stays flat. */
export const MAX_AHEAD_S = 20
/** Emby finishes a subtitle segment once its next video segment is done; one more for
 * margin. */
const SUBTITLE_LAG = 2
/** A failed segment fetch is retried in place this many times before the engine gives
 * up and lets the player reconnect (which starts over with an empty buffer)… */
const SEGMENT_RETRIES = 3
/** …but while more than this is still buffered, network failures are retried for as long
 * as they last: the buffer plays on meanwhile, and the next segment continues it. */
const KEEP_TRYING_S = 1
const RETRY_DELAY_MS = 1000
/** No bytes for this long = the request is stuck (mobile networks stall without
 * failing): abort it and ask again, picking up where it stopped. */
export const SEGMENT_STALL_MS = 5000
/** …but a segment the server is still preparing may take longer to start. */
const SEGMENT_FIRST_BYTE_MS = 15000
const WAIT_POLL_MS = 250

class HttpError extends Error {
  readonly status: number

  constructor(status: number, url: string) {
    super(`HTTP ${status} for ${new URL(url).pathname}`)
    this.status = status
  }
}

/** Waits, or rejects as soon as the engine stops. The abort listener goes away with the
 * timer: this runs every WAIT_POLL_MS for hours, and leftover listeners would pile up. */
export const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })

class StalledError extends Error {}

async function get(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<Response> {
  // no-store: a segment is read once; the browser's cache would only hold on to it (it
  // grew Chromium's network process by ~50 MB over a film).
  const response = await fetch(url, { headers, signal, credentials: 'same-origin', cache: 'no-store' })
  if (!response.ok) throw new HttpError(response.status, url)
  return response
}

// Seeking reconnects with the same playlist URL: keep the last few, so a seek costs
// one segment request, not two playlist round trips first.
interface Playlists {
  segments: Segment[]
  /** Subtitle segments, when the master playlist has a subtitle rendition (Emby). */
  subtitles: Segment[] | null
}
const playlists = new Map<string, Promise<Playlists>>()
const MAX_PLAYLISTS = 4

function loadPlaylist(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<Playlists> {
  let p = playlists.get(url)
  if (!p) {
    p = (async () => {
      const text = await (await get(url, headers, signal)).text()
      const variant = firstVariant(text, url)
      const subs = subtitleRendition(text, url)
      const [media, subtitles] = await Promise.all([
        variant ? get(variant, headers, signal).then((r) => r.text()) : text,
        subs ? get(subs, headers, signal).then(async (r) => parseMediaPlaylist(await r.text(), subs)).catch(() => null) : null,
      ])
      const segments = parseMediaPlaylist(media, variant ?? url)
      if (!segments.length) throw new Error('empty playlist')
      return { segments, subtitles: subtitles?.length ? subtitles : null }
    })()
    p.catch(() => playlists.delete(url))
    playlists.set(url, p)
    while (playlists.size > MAX_PLAYLISTS) playlists.delete(playlists.keys().next().value!)
  }
  return p
}

/** Gateway errors: a proxy in front of the server lost it for a moment. */
const TRANSIENT = new Set([502, 503, 504])

/** What a failure means for the player: the server said no (show it) or the network
 * failed (retry by reconnecting). */
function classify(e: unknown): { message: string; kind: EngineErrorKind } {
  if (e instanceof HttpError) return { message: e.message, kind: TRANSIENT.has(e.status) ? 'network' : 'connection' }
  return { message: e instanceof Error ? e.message : String(e), kind: 'network' }
}

/**
 * A media server's HLS transcode (H.264 with B-frames + AAC in MPEG-TS segments) → the
 * WebCodecs pipeline. Starts at the segment holding the requested time; fetches
 * segments one after another, streaming each into the demuxer as it arrives, and stays
 * at most MAX_AHEAD_S (+ PROBE_EXTRA_S while probing) ahead of the clock — also while paused, so playing again continues
 * from the buffer and then the next segments. `url` = playlist URL + `#t=<start seconds>`.
 */
export function createHlsEngine(
  canvas: HTMLCanvasElement,
  url: string,
  cb: EngineCallbacks,
  headers: Record<string, string> = {},
): StreamEngine {
  const pipeline = createPipeline(canvas, cb, { reorder: true })
  const abort = new AbortController()
  pipeline.onDestroy = () => abort.abort()
  let probing = false
  pipeline.probe = (on) => {
    probing = on
  }
  void run(pipeline, url, headers, abort.signal, () => MAX_AHEAD_S + (probing ? PROBE_EXTRA_S : 0), cb)
  return pipeline
}

async function run(
  pipeline: Pipeline,
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  maxAhead: () => number,
  cb: Pick<EngineCallbacks, 'onCues'>,
) {
  const { url: playlistUrl, start } = splitStart(url)
  try {
    const { segments, subtitles } = await loadPlaylist(playlistUrl, headers, signal)
    let i = segmentAt(segments, start)
    // The picture starts at the segment boundary, up to one segment before `start`.
    pipeline.setStartOffset(segments[i].start - start)
    const first = i
    // Subtitles: the same transcode writes them alongside, a few hundred bytes a segment,
    // but a subtitle segment is complete only once the encoder is past it: fetched
    // SUBTITLE_LAG segments behind the video (still far ahead of the clock).
    let subsDone = -1
    const subtitlesUpTo = (j: number) => {
      if (!subtitles || !cb.onCues) return
      for (let k = Math.max(subsDone + 1, segmentAt(subtitles, segments[first].start)); k <= segmentAt(subtitles, segments[j].start); k++) {
        void fetchCues(subtitles[k].url, headers, signal, cb.onCues)
        subsDone = k
      }
    }
    for (; i < segments.length; i++) {
      while (pipeline.bufferedAhead() > maxAhead()) await sleep(WAIT_POLL_MS, signal)
      pipeline.inputStats.segment = i
      await fetchSegment(pipeline, segments[i].url, headers, signal)
      if (i - SUBTITLE_LAG >= first) subtitlesUpTo(i - SUBTITLE_LAG)
    }
    subtitlesUpTo(segments.length - 1)
    pipeline.flush()
  } catch (e) {
    if (signal.aborted || pipeline.destroyed) return
    const { message, kind } = classify(e)
    pipeline.fail(message, kind)
  }
}

/** Cue times are media seconds as they are: Emby writes LOCAL 0 = the stream's start
 * (X-TIMESTAMP-MAP), and its transcode keeps the source's timestamps. A segment that
 * fails just has no subtitles. */
async function fetchCues(url: string, headers: Record<string, string>, signal: AbortSignal, onCues: (cues: Cue[]) => void) {
  try {
    const cues = parseSubtitles(await (await get(url, headers, signal)).text())
    if (cues.length && !signal.aborted) onCues(cues)
  } catch {
    // missing a few lines beats stopping the picture
  }
}

/** Transfer time and bytes not yet measured, summed over segments until there's enough
 * for a measurement (MEASURE_MIN_*): a small segment alone is over before TCP is at full
 * speed. Only the transfers count, not the server preparing segments or our waits. */
const unmeasured = new WeakMap<Pipeline, { bytes: number; ms: number }>()

export function transferred(pipeline: Pipeline, bytes: number, ms: number) {
  const sum = unmeasured.get(pipeline) ?? { bytes: 0, ms: 0 }
  sum.bytes += bytes
  sum.ms += ms
  if (sum.ms >= MEASURE_MIN_MS || sum.bytes >= MEASURE_MIN_BYTES) {
    if (sum.ms > 50) measured(pipeline, sum.bytes, sum.ms)
    unmeasured.delete(pipeline)
  } else unmeasured.set(pipeline, sum)
}

export async function fetchSegment(pipeline: Pipeline, url: string, headers: Record<string, string>, signal: AbortSignal) {
  let pushed = 0 // bytes of this segment already handed on (a retry skips them)
  let failures = 0 // failures with nothing buffered to cover them
  for (;;) {
    const asked = performance.now()
    // Its own abort, so a stalled attempt can be dropped without stopping the engine.
    const attemptAbort = new AbortController()
    const stopAttempt = () => attemptAbort.abort(signal.reason)
    signal.addEventListener('abort', stopAttempt, { once: true })
    let stalled = false
    let timer = 0
    const arm = (ms: number) => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        stalled = true
        attemptAbort.abort(new StalledError('segment stalled'))
      }, ms)
    }
    try {
      arm(SEGMENT_FIRST_BYTE_MS)
      const response = await get(url, headers, attemptAbort.signal)
      const reader = response.body!.getReader()
      let seen = 0 // bytes of this response so far
      let firstByteAt = 0
      for (;;) {
        arm(SEGMENT_STALL_MS)
        const { done, value } = await reader.read()
        if (done) {
          // Waiting = the server preparing the segment; the rest = the network.
          const end = performance.now()
          pipeline.inputStats.segmentLoadMs = Math.round(end - asked)
          if (firstByteAt) transferred(pipeline, seen, end - firstByteAt)
          return
        }
        if (seen === 0) firstByteAt = performance.now()
        if (seen === 0 && pushed === 0) pipeline.inputStats.segmentWaitMs = Math.round(performance.now() - asked)
        // A retried segment repeats what we already have: skip that part (segments are
        // files on the server, the same bytes every time).
        const fresh = seen + value.length > pushed ? value.subarray(Math.max(0, pushed - seen)) : null
        seen += value.length
        if (fresh?.length) {
          pipeline.push(fresh)
          pushed += fresh.length
        }
      }
    } catch (e) {
      if (signal.aborted) throw e
      const retryable = stalled || !(e instanceof HttpError) || TRANSIENT.has(e.status)
      const covered = (pipeline.bufferedAhead?.() ?? 0) > KEEP_TRYING_S
      if (!retryable || (!covered && ++failures > SEGMENT_RETRIES)) throw stalled ? new Error('segment stalled') : e
      pipeline.inputStats.segmentRetries = (pipeline.inputStats.segmentRetries ?? 0) + 1
      await sleep(RETRY_DELAY_MS, signal)
    } finally {
      window.clearTimeout(timer)
      signal.removeEventListener('abort', stopAttempt)
    }
  }
}

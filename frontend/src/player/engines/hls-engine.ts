import { firstVariant, parseMediaPlaylist, type Segment, segmentAt, splitStart } from './hls'
import type { EngineCallbacks, EngineErrorKind, StreamEngine } from './types'
import { createPipeline, type Pipeline } from './webcodecs-pipeline'

/** Compressed video fetched ahead of the clock (≈ three 3 s segments). Segments past
 * that wait: the server transcodes on demand, and the car's memory stays flat. */
const MAX_AHEAD_S = 9
/** A failed segment fetch is retried in place this many times before the engine gives
 * up and lets the player reconnect. */
const SEGMENT_RETRIES = 2
const RETRY_DELAY_MS = 1000
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

async function get(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<Response> {
  // no-store: a segment is read once; the browser's cache would only hold on to it (it
  // grew Chromium's network process by ~50 MB over a film).
  const response = await fetch(url, { headers, signal, credentials: 'same-origin', cache: 'no-store' })
  if (!response.ok) throw new HttpError(response.status, url)
  return response
}

// Seeking reconnects with the same playlist URL: keep the last few, so a seek costs
// one segment request, not two playlist round trips first.
const playlists = new Map<string, Promise<Segment[]>>()
const MAX_PLAYLISTS = 4

function loadPlaylist(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<Segment[]> {
  let p = playlists.get(url)
  if (!p) {
    p = (async () => {
      const text = await (await get(url, headers, signal)).text()
      const variant = firstVariant(text, url)
      const media = variant ? await (await get(variant, headers, signal)).text() : text
      const segments = parseMediaPlaylist(media, variant ?? url)
      if (!segments.length) throw new Error('empty playlist')
      return segments
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
 * at most MAX_AHEAD_S ahead of the clock. `url` = playlist URL + `#t=<start seconds>`.
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
  void run(pipeline, url, headers, abort.signal)
  return pipeline
}

async function run(pipeline: Pipeline, url: string, headers: Record<string, string>, signal: AbortSignal) {
  const { url: playlistUrl, start } = splitStart(url)
  try {
    const segments = await loadPlaylist(playlistUrl, headers, signal)
    let i = segmentAt(segments, start)
    // The picture starts at the segment boundary, up to one segment before `start`.
    pipeline.setStartOffset(segments[i].start - start)
    for (; i < segments.length; i++) {
      while (pipeline.bufferedAhead() > MAX_AHEAD_S) await sleep(WAIT_POLL_MS, signal)
      await fetchSegment(pipeline, segments[i].url, headers, signal)
    }
    pipeline.flush()
  } catch (e) {
    if (signal.aborted || pipeline.destroyed) return
    const { message, kind } = classify(e)
    pipeline.fail(message, kind)
  }
}

async function fetchSegment(pipeline: Pipeline, url: string, headers: Record<string, string>, signal: AbortSignal) {
  for (let attempt = 0; ; attempt++) {
    let received = false
    try {
      const response = await get(url, headers, signal)
      const reader = response.body!.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return
        received = true
        pipeline.push(value)
      }
    } catch (e) {
      // Retried here only if nothing of it arrived yet (a retry would replay what was
      // pushed) and the failure may pass; otherwise the player reconnects in place.
      const retryable = !(e instanceof HttpError) || TRANSIENT.has(e.status)
      if (signal.aborted || received || !retryable || attempt >= SEGMENT_RETRIES) throw e
      await sleep(RETRY_DELAY_MS, signal)
    }
  }
}

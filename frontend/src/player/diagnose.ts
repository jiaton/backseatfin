import type { EngineStats } from './engines/types'
import type { StringKey } from './i18n'

/** One sentence on how playback is going and, when it stutters, why: the network, the
 * server, or this device's decoder. Shown at the top of the stats panel. */
export interface Diagnosis {
  key: StringKey
  vars?: Record<string, string>
}

export interface PlayerState {
  paused: boolean
  retrying: boolean
  /** A picture is playing (readyState ≥ HAVE_ENOUGH_DATA). */
  started: boolean
  stats: EngineStats
}

/** Picture this far behind the clock = the decoder can't keep up. */
const DECODER_BEHIND_MS = 300
/** HLS: a segment taking this long before its first byte = the server is slow (a 3 s
 * segment must be ready well within 3 s). */
const SERVER_WAIT_MS = 2000
/** Less buffered than this, while data comes in slower than real time = stuttering. */
const LOW_BUFFER_S = 2
const REALTIME_MIN = 0.95

const mbps = (kbps: number) => (kbps / 1000).toFixed(1)

export function diagnose({ paused, retrying, started, stats: s }: PlayerState): Diagnosis {
  if (retrying) return { key: 'statsOutage' }
  if (paused) return { key: 'statsPaused', vars: { buffer: (s.bufferAheadS ?? 0).toFixed(1) } }
  if (!started) return { key: 'statsStarting' }
  // An empty buffer explains a picture behind the clock: nothing to decode, not slow
  // decoding (2026-10-23: "can't decode fast enough, 18 s behind" at 0.49× real time).
  const lowBuffer = (s.bufferAheadS ?? Number.POSITIVE_INFINITY) < LOW_BUFFER_S
  if (lowBuffer && (s.segmentWaitMs ?? 0) > SERVER_WAIT_MS) return { key: 'statsSlowServer', vars: { ms: String(s.segmentWaitMs) } }
  if (lowBuffer && s.realtime != null && s.realtime < REALTIME_MIN && s.streamKbps) {
    return { key: 'statsSlowData', vars: { rate: mbps(s.receiveKbps ?? 0), need: mbps(s.streamKbps) } }
  }
  if (!lowBuffer && (s.videoBehindMs ?? 0) > DECODER_BEHIND_MS) return { key: 'statsSlowDecoder', vars: { ms: String(s.videoBehindMs) } }
  return { key: 'statsOk' }
}

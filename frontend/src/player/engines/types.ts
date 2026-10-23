/** A way of turning a stream into pictures and sound on a canvas. The player swaps
 * engines without caring which one runs.
 * webcodecs: our server's H.264 stream over a WebSocket, hardware-decoded.
 * jsmpeg: our server's MPEG-1 stream over a WebSocket, decoded in WebAssembly.
 * hls: a media server's own HLS transcode (H.264 + B-frames), hardware-decoded. */
export type EngineKind = 'webcodecs' | 'jsmpeg' | 'hls'

/** decode: this engine can't decode here (worth falling back to another engine).
 * connection: the server refused the stream and said why (show it, offer a retry).
 * network: the connection failed or dropped without a reason — an outage, worth
 * retrying by itself. */
export type EngineErrorKind = 'decode' | 'connection' | 'network'

export interface EngineCallbacks {
  onFirstFrame(): void
  /** message: technical detail (English, not for display as is). closeCode: the stream
   * WebSocket's close code when it closed before playing. */
  onError(message: string, kind: EngineErrorKind, closeCode?: number): void
  onAudioLocked(locked: boolean): void
}

export interface EngineStats {
  framesDrawn: number
  /** Decoded but skipped because their time had passed (the decoder fell behind). */
  framesLate?: number
  /** Decoded frames waiting for their time. */
  framesQueued?: number
  /** Received compressed frames not yet handed to the decoder. */
  chunksPending?: number
  /** Compressed frames dropped to catch up with the clock (decoder too slow). */
  chunksSkipped?: number
  audioScheduled?: number
  /** Size of the picture being drawn (what the server actually sends). */
  videoWidth?: number
  videoHeight?: number
  // For the stats panel ("stats for nerds"):
  codec?: string
  /** Frames drawn per second, over the last 2 s. */
  fps?: number
  bytesReceived?: number
  /** Receive rate over the last few seconds. */
  receiveKbps?: number
  /** The stream's own bitrate (bytes received per media second). */
  streamKbps?: number
  /** Media seconds received per second: below 1 = arriving slower than it plays. */
  realtime?: number
  /** Seconds of video received but not yet shown. */
  bufferAheadS?: number
  /** Average time from handing a frame to the decoder to getting it back (includes
   * frames held back for B-frame reordering). */
  decodeMs?: number
  decodeQueue?: number
  /** Times the decoder was reset to jump ahead (it had fallen too far behind). */
  decoderResets?: number
  /** How far the picture lags the clock (decoder or input falling behind). */
  videoBehindMs?: number
  /** Picture minus sound being heard, ms: positive = picture ahead. */
  avOffsetMs?: number
  outputLatencyMs?: number
  audioClock?: 'audio' | 'wall'
  audioFormat?: string
  audioBufferedS?: number
  /** Our server's stream: connections replaced mid-stream (stuck, or after a long
   * pause), and whether the server is told to hold (buffer full). */
  reconnects?: number
  held?: boolean
  /** HLS: the last segment's time to first byte / to the end, and its number. */
  segmentWaitMs?: number
  segmentLoadMs?: number
  segment?: number
  /** HLS: segment requests retried (network failures, stalls). */
  segmentRetries?: number
}

export interface StreamEngine {
  /** Seconds of media presented since this stream's start offset. */
  elapsed(): number
  /** performance.now() of the last frame drawn (stall watchdog). */
  lastFrameAt(): number
  /** Call from a user gesture; resumes audio if the browser held it back. */
  unlockAudio(): void
  /** 0–1. */
  setVolume(volume: number): void
  /** Counters for diagnostics and tests. */
  stats(): EngineStats
  /** Optional: freeze in place, keeping what's buffered. */
  pause?(): void
  /** After pause(): true = playing again from the buffer; false = can't (reconnect). */
  resume?(): boolean
  /** Optional: jump forward to `elapsed` seconds within what's already received (lands
   * on the keyframe at or before it). false = not buffered that far (reconnect). */
  skipTo?(elapsed: number): boolean
  destroy(): void
}

/** Our server's stream WebSocket `format` for each engine that reads it. */
export const ENGINE_FORMAT = { webcodecs: 'h264ts', jsmpeg: 'jsmpeg_ts' } as const satisfies Partial<Record<EngineKind, string>>

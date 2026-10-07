import { avcCodecString } from './annexb'
import { type AacConfig, type AudioSample, TsDemuxer, type VideoSample } from './mpegts'

import { AAC_CODEC, H264_CODEC } from './detect'
import type { EngineCallbacks, EngineErrorKind, StreamEngine } from './types'

/** Buffered picture needed before playback starts. */
const START_LEAD_S = 0.5
/** …but never wait longer than this after the first frame. */
const START_MAX_WAIT_MS = 1500
/** Video is decoded only this far ahead of the clock; the rest of the buffer (a start
 * burst, network jitter, a prefetched segment) waits *compressed*. A decoded 1080p frame
 * is ~3 MB of (often GPU) memory and hardware decoders have few output surfaces; 2 s
 * of compressed 1080p is ~0.7 MB. */
export const DECODE_AHEAD_S = 0.5
/** Hard cap on decoded frames waiting for their time, whatever the timestamps say. */
const MAX_QUEUED_FRAMES = 24
/** If the oldest undecoded frame is this far behind the clock, the decoder can't keep
 * up (slow device, or a backlog after a network hiccup): jump to the newest keyframe
 * instead of decoding stale frames, so the backlog can't grow without bound. */
const CATCH_UP_S = 1

/** Two consecutive audio buffers closer than this to "back to back" are played
 * back to back: per-buffer rounding otherwise leaves µs gaps/overlaps that crackle. */
const AUDIO_SNAP_S = 0.05

let sharedAudio: AudioContext | null = null
/** One AudioContext for the page: once a tap unlocks it, reconnects (seek, pause,
 * track switch) don't need another tap. 48 kHz = the streams' AAC rate, so buffers
 * aren't resampled one by one (another source of clicks at buffer boundaries). */
function audioContext(): AudioContext {
  sharedAudio ??= new AudioContext({ latencyHint: 'playback', sampleRate: 48000 })
  return sharedAudio
}

export interface PipelineOptions {
  /** The stream may have B-frames (decode order ≠ display order): let the decoder
   * reorder instead of asking it to output each frame at once. */
  reorder?: boolean
}

/** The decoding half of a WebCodecs engine. An input (WebSocket, HLS) feeds it MPEG-TS
 * bytes; it is the engine the player sees. */
export interface Pipeline extends StreamEngine {
  push(bytes: Uint8Array): void
  /** End of input: emit what the demuxer still holds. */
  flush(): void
  /** Seconds the stream's first picture lies *after* the requested start (negative:
   * before it, e.g. HLS starts at a segment boundary). Added to elapsed(). */
  setStartOffset(seconds: number): void
  /** Seconds of video received but not yet due (what an input may keep fetching up to). */
  bufferedAhead(): number
  fail(message: string, kind: EngineErrorKind, closeCode?: number): void
  readonly destroyed: boolean
  /** Called once on destroy, for the input to stop. */
  onDestroy: (() => void) | null
}

/**
 * H.264 + AAC in MPEG-TS → hardware VideoDecoder + AudioDecoder → canvas + WebAudio.
 *
 * Clock: presentation follows the audio clock (AudioContext.currentTime) once audio is
 * running, and the wall clock until then (e.g. before a tap unlocks sound); switching
 * re-anchors at the current media time, so the picture never jumps. Audio buffers
 * are scheduled at their exact timestamps on that clock; video frames are drawn when
 * their (presentation) timestamp comes due. Compressed video waits in decode order and
 * is fed to the decoder by its decode timestamp. Everything this engine plays goes
 * through one GainNode, so destroy() silences already-scheduled audio at once.
 */
export function createPipeline(canvas: HTMLCanvasElement, cb: EngineCallbacks, opts: PipelineOptions = {}): Pipeline {
  const ctx2d = canvas.getContext('2d')
  const audio = audioContext()
  const out = audio.createGain()
  out.connect(audio.destination)

  // Diagnostics on the canvas (data-* attributes): frames drawn, audio buffers
  // scheduled, which clock drives playback. Cheap, and visible to tests and devtools.
  let drawnCount = 0
  let audioCount = 0
  canvas.dataset.engine = 'webcodecs'

  let destroyed = false
  let firstFrameShown = false
  let lastFrameAt = performance.now()
  let lateFrames = 0
  let skippedChunks = 0
  let startOffset = 0
  let lastReceived: number | null = null // pts of the newest video received
  const frames: VideoFrame[] = [] // decoded, waiting for their time
  const pending: { chunk: EncodedVideoChunk; dts: number }[] = [] // received, not yet decoded

  // --- clock ---------------------------------------------------------------------------
  let firstPts: number | null = null // media time the stream starts at
  let firstDecodedAt = 0 // performance.now() when the first frame decoded
  let anchorMedia: number | null = null
  let anchorAudio = 0
  let anchorWall = 0
  let onAudioClock = false

  const mediaNow = (): number | null => {
    if (anchorMedia == null) return null
    return onAudioClock
      ? anchorMedia + (audio.currentTime - anchorAudio)
      : anchorMedia + (performance.now() / 1000 - anchorWall)
  }
  const anchor = (media: number) => {
    anchorMedia = media
    anchorAudio = audio.currentTime
    anchorWall = performance.now() / 1000
    onAudioClock = audio.state === 'running'
    nextAudioAt = 0
  }
  const onAudioState = () => {
    const now = mediaNow()
    if (now != null && audio.state === 'running' && !onAudioClock) anchor(now) // wall → audio, seamlessly
    cb.onAudioLocked(audio.state !== 'running')
  }
  audio.addEventListener('statechange', onAudioState)

  const fail = (message: string, kind: EngineErrorKind = 'decode', closeCode?: number) => {
    if (!destroyed) cb.onError(message, kind, closeCode)
  }

  // --- video ---------------------------------------------------------------------------
  const videoDecoder: VideoDecoder = new VideoDecoder({
    output: (frame) => {
      if (destroyed) return frame.close()
      if (firstPts == null) {
        firstPts = frame.timestamp / 1e6
        firstDecodedAt = performance.now()
      }
      frames.push(frame)
      while (frames.length > MAX_QUEUED_FRAMES) frames.shift()!.close()
      pump()
    },
    error: (e) => fail(`video decoder: ${e.message}`, 'decode'),
  })

  /** Feeds the decoder up to DECODE_AHEAD_S past the clock (by decode time). Before
   * playback starts it fills the start lead instead; until the very first frame comes
   * out it feeds freely (bounded by the frame cap), since some decoders want a few
   * inputs before any output — with B-frames, several. */
  const pump = () => {
    if (videoDecoder.state !== 'configured') return
    const now = mediaNow()
    if (now != null && pending.length && pending[0].dts < now - CATCH_UP_S) {
      for (let i = pending.length - 1; i > 0; i--) {
        if (pending[i].chunk.type === 'key' && pending[i].dts <= now + DECODE_AHEAD_S) {
          pending.splice(0, i)
          skippedChunks += i
          break
        }
      }
    }
    const horizon =
      now != null ? now + DECODE_AHEAD_S : firstPts != null ? firstPts + START_LEAD_S + 0.1 : Number.POSITIVE_INFINITY
    while (
      pending.length &&
      pending[0].dts <= horizon &&
      frames.length + videoDecoder.decodeQueueSize < MAX_QUEUED_FRAMES
    ) {
      videoDecoder.decode(pending.shift()!.chunk)
    }
  }
  videoDecoder.addEventListener('dequeue', pump)

  const onVideo = (s: VideoSample) => {
    if (videoDecoder.state === 'unconfigured') {
      if (!s.key) return // a decoder must start on a keyframe
      // optimizeForLatency: output each frame as soon as it's decoded. Only without
      // B-frames — with them, frames must wait for later ones to come out in order.
      videoDecoder.configure({ codec: avcCodecString(s.data) ?? H264_CODEC, optimizeForLatency: !opts.reorder })
    }
    lastReceived = Math.max(lastReceived ?? s.pts, s.pts)
    pending.push({
      chunk: new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: Math.round(s.pts * 1e6), data: s.data }),
      dts: s.dts,
    })
    pump()
  }

  // --- audio ---------------------------------------------------------------------------
  let audioDecoder: AudioDecoder | null = null
  let audioConfigKey = ''
  let nextAudioAt = 0 // AudioContext time where the previous buffer ends
  const playAudio = (data: AudioData) => {
    try {
      const now = mediaNow()
      if (now == null || !onAudioClock || destroyed) return // not playing yet, or sound still locked
      const ideal = anchorAudio + (data.timestamp / 1e6 - anchorMedia!)
      // Back to back with the previous buffer unless it has drifted noticeably.
      const when = nextAudioAt && Math.abs(ideal - nextAudioAt) < AUDIO_SNAP_S ? nextAudioAt : ideal
      if (when < audio.currentTime) {
        nextAudioAt = 0 // late: skip, and re-sync on the next buffer
        return
      }
      const buffer = audio.createBuffer(data.numberOfChannels, data.numberOfFrames, data.sampleRate)
      for (let ch = 0; ch < data.numberOfChannels; ch++) {
        const plane = new Float32Array(data.numberOfFrames)
        data.copyTo(plane, { planeIndex: ch, format: 'f32-planar' })
        buffer.copyToChannel(plane, ch)
      }
      const source = audio.createBufferSource()
      source.buffer = buffer
      source.connect(out)
      source.start(when)
      nextAudioAt = when + buffer.duration
      canvas.dataset.audioScheduled = String(++audioCount)
    } finally {
      data.close()
    }
  }
  const configureAudio = (config: AacConfig) => {
    const key = `${config.sampleRate}/${config.channels}/${config.asc.join(',')}`
    if (key === audioConfigKey && audioDecoder) return
    audioDecoder?.close()
    audioConfigKey = key
    audioDecoder = new AudioDecoder({ output: playAudio, error: (e) => fail(`audio decoder: ${e.message}`, 'decode') })
    audioDecoder.configure({
      codec: AAC_CODEC,
      sampleRate: config.sampleRate,
      numberOfChannels: config.channels,
      description: config.asc,
    })
  }
  const onAudio = (s: AudioSample) => {
    configureAudio(s.config)
    if (audioDecoder?.state !== 'configured') return
    audioDecoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: Math.round(s.pts * 1e6), data: s.data }))
  }

  const demuxer = new TsDemuxer(onVideo, onAudio)

  // --- presentation loop ---------------------------------------------------------------
  let raf = 0
  const render = () => {
    if (destroyed) return
    raf = requestAnimationFrame(render)
    if (anchorMedia == null && firstPts != null) {
      const buffered = frames.length ? frames[frames.length - 1].timestamp / 1e6 - firstPts : 0
      if (buffered >= START_LEAD_S || performance.now() - firstDecodedAt > START_MAX_WAIT_MS) anchor(firstPts)
    }
    pump()
    const now = mediaNow()
    if (now == null) return
    let due: VideoFrame | null = null
    while (frames.length && frames[0].timestamp / 1e6 <= now) {
      if (due) {
        due.close() // late frames are skipped; only the newest due one is drawn
        lateFrames++
      }
      due = frames.shift()!
    }
    if (!due) return
    if (canvas.width !== due.displayWidth || canvas.height !== due.displayHeight) {
      canvas.width = due.displayWidth
      canvas.height = due.displayHeight
    }
    ctx2d?.drawImage(due, 0, 0)
    due.close()
    lastFrameAt = performance.now()
    canvas.dataset.framesDrawn = String(++drawnCount)
    canvas.dataset.clock = onAudioClock ? 'audio' : 'wall'
    if (!firstFrameShown) {
      firstFrameShown = true
      cb.onFirstFrame()
      cb.onAudioLocked(audio.state !== 'running')
    }
  }
  raf = requestAnimationFrame(render)

  const pipeline: Pipeline = {
    push: (bytes) => {
      if (destroyed) return
      try {
        demuxer.push(bytes)
      } catch (err) {
        fail(`demux: ${err instanceof Error ? err.message : String(err)}`, 'decode')
      }
    },
    flush: () => demuxer.flush(),
    setStartOffset: (seconds) => {
      startOffset = seconds
    },
    bufferedAhead: () => {
      if (lastReceived == null) return 0
      return lastReceived - (mediaNow() ?? firstPts ?? lastReceived)
    },
    fail,
    get destroyed() {
      return destroyed
    },
    onDestroy: null,
    elapsed: () => {
      const now = mediaNow()
      return now == null || firstPts == null ? 0 : now - firstPts + startOffset
    },
    lastFrameAt: () => lastFrameAt,
    setVolume: (volume) => {
      out.gain.value = volume
    },
    stats: () => ({
      framesDrawn: drawnCount,
      framesLate: lateFrames,
      framesQueued: frames.length,
      chunksPending: pending.length,
      chunksSkipped: skippedChunks,
      audioScheduled: audioCount,
      videoWidth: drawnCount ? canvas.width : 0,
      videoHeight: drawnCount ? canvas.height : 0,
    }),
    unlockAudio: () => {
      if (audio.state !== 'running') void audio.resume()
    },
    destroy: () => {
      if (destroyed) return
      destroyed = true
      cancelAnimationFrame(raf)
      audio.removeEventListener('statechange', onAudioState)
      pipeline.onDestroy?.()
      out.disconnect() // silences audio already scheduled ahead
      for (const f of frames.splice(0)) f.close()
      pending.length = 0
      if (videoDecoder.state !== 'closed') videoDecoder.close()
      if (audioDecoder && audioDecoder.state !== 'closed') audioDecoder.close()
    },
  }
  return pipeline
}

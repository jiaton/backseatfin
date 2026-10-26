import { avcCodecString } from './annexb'
import { type AacConfig, type AudioSample, TsDemuxer, type VideoSample } from './mpegts'

import { AAC_CODEC, H264_CODEC } from './detect'
import type { EngineCallbacks, EngineErrorKind, EngineStats, StreamEngine } from './types'

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
/** If the picture is this far behind and the decoder still holds a backlog, catching up
 * on the input isn't enough: reset the decoder and restart at the newest keyframe. */
const RESET_BEHIND_S = 1.5
/** Audio is decoded this far ahead of the clock (PCM is ~0.4 MB per second)… */
const AUDIO_DECODE_AHEAD_S = 1.5
/** …and handed to WebAudio this far ahead of what's being heard. */
const AUDIO_SCHEDULE_AHEAD_S = 0.5
/** Sound starts this long after the clock is anchored, so the first buffers can be
 * scheduled in time instead of being late. */
const AUDIO_START_LEAD_S = 0.1
/** Two consecutive audio buffers closer than this to "back to back" are played
 * back to back: per-buffer rounding otherwise leaves µs gaps/overlaps that crackle. */
const AUDIO_SNAP_S = 0.05
/** A frame is drawn on the screen refresh after it comes due (half a refresh late on
 * average) and shows a moment after that: draw it this much early, so the picture
 * doesn't trail the sound (people notice sound leading the picture sooner than the
 * other way round). */
const PRESENT_LEAD_S = 0.02
/** A stream started mid-film may begin its picture at the keyframe before the requested
 * time and its sound exactly at it (ffmpeg copying the video): up to this much picture
 * before the sound is skipped, so the film starts where asked, with sound. */
const MAX_PREROLL_S = 10
/** The clock caught up with everything received (a slow network): it stops, like a
 * pause, until this much is buffered again. Running on would only show the frames that
 * trickle in as already late (a stutter) and drop the sound as past. */
export const REBUFFER_S = 2
/** A skip forward within the buffer must leave at least this much to play, or the
 * stream would run dry right after it: reconnect instead. */
export const SKIP_MIN_LEFT_S = 2
/** What's already played stays this long, *compressed* (≈ 2 MB at 480p, 7 MB at 1080p),
 * from the keyframe before it on: a skip back within it (a "−15 s" tap) needs no new
 * stream. Decoded frames are never kept. */
export const KEEP_BEHIND_S = 20
/** Window for the receive-rate statistics (long enough to span an HLS segment). */
const RATE_WINDOW_MS = 6000

let sharedAudio: AudioContext | null = null
/** One AudioContext for the page: once a tap unlocks it, reconnects (seek, pause,
 * track switch) don't need another tap. 48 kHz = the streams' AAC rate, so buffers
 * aren't resampled one by one (another source of clicks at buffer boundaries). */
function audioContext(): AudioContext {
  sharedAudio ??= new AudioContext({ latencyHint: 'playback', sampleRate: 48000 })
  return sharedAudio
}

/** The AudioContext time of the sound coming out of the speakers right now. The graph
 * runs ahead of the speakers by the output latency (tens of ms on a desktop, hundreds
 * through some car or Bluetooth audio, and it can change while playing); the picture
 * follows what's heard, not what's been handed to the audio system. */
export function heardTime(audio: AudioContext): number {
  const ts = audio.getOutputTimestamp?.()
  if (ts?.contextTime && ts.performanceTime) {
    const t = ts.contextTime + (performance.now() - ts.performanceTime) / 1000
    if (t <= audio.currentTime) return t
  }
  return Math.max(0, audio.currentTime - (audio.outputLatency || 0) - (audio.baseLatency || 0))
}

export interface PipelineOptions {
  /** The stream may have B-frames (decode order ≠ display order): let the decoder
   * reorder instead of asking it to output each frame at once. */
  reorder?: boolean
}

/** Counters a pipeline's input adds to the statistics. */
export interface InputStats {
  /** Last HLS segment: time to first byte and to the last, ms (server vs network). */
  segmentWaitMs?: number
  segmentLoadMs?: number
  segment?: number
  /** Segment requests retried (network failures, stalls). */
  segmentRetries?: number
  /** The network's rate while the input was actually fetching (a whole segment, or a
   * stretch of the stream not held back), kbit/s, and how many such measurements. */
  networkKbps?: number
  networkSamples?: number
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
  readonly paused: boolean
  /** Called once on destroy, for the input to stop. */
  onDestroy: (() => void) | null
  /** Asked on resume: false = the input gave up while paused (reconnect instead). */
  canResume: () => boolean
  /** Pts of the first and the newest video received (null before any). */
  receivedRange(): { first: number; last: number } | null
  /**
   * Continues the stream from a second connection that starts at `cut` (a pts on this
   * stream's timeline): buffered media from `cut` on is dropped, and what's pushed from
   * now on is a new MPEG-TS stream whose first keyframe is placed at `cut`.
   */
  spliceAt(cut: number): void
  inputStats: InputStats
}

/** While probing (StreamEngine.probe), inputs buffer this much more than usual. */
export const PROBE_EXTRA_S = 10
/** A measurement needs a transfer this long, or this big (TCP takes a moment to reach
 * full speed; a short one would only say the network is at least that fast). */
export const MEASURE_MIN_MS = 1000
export const MEASURE_MIN_BYTES = 1 << 20

/** Records a network rate an input measured while fetching (InputStats.networkKbps). */
export function measured(pipeline: Pipeline, bytes: number, ms: number) {
  pipeline.inputStats.networkKbps = Math.round((bytes * 8) / ms)
  pipeline.inputStats.networkSamples = (pipeline.inputStats.networkSamples ?? 0) + 1
}

interface ReadyAudio {
  buffer: AudioBuffer
  ts: number // media seconds
  /** Seconds at its start already heard (before a pause): skipped when rescheduled. */
  skip?: number
}

interface ScheduledAudio extends ReadyAudio {
  node: AudioBufferSourceNode
  when: number // context time it starts
}

/**
 * H.264 + AAC in MPEG-TS → hardware VideoDecoder + AudioDecoder → canvas + WebAudio.
 *
 * Clock: once sound runs, media time follows the sound being *heard* (see heardTime);
 * before that (e.g. until a tap unlocks sound) it follows the wall clock, and switching
 * re-anchors at the current media time. Audio buffers are scheduled on the AudioContext
 * so they're heard exactly when the picture shows the same moment; video frames are
 * drawn when their (presentation) timestamp comes due. Both video and audio wait
 * *compressed* and are decoded shortly before they're needed. Pausing freezes the clock
 * and keeps everything buffered, so playing again needs no reconnect.
 */
export function createPipeline(canvas: HTMLCanvasElement, cb: EngineCallbacks, opts: PipelineOptions = {}): Pipeline {
  // Opaque: video has no transparency, and the browser can skip blending the canvas.
  const ctx2d = canvas.getContext('2d', { alpha: false })
  const audio = audioContext()
  const out = audio.createGain()
  out.connect(audio.destination)

  canvas.dataset.engine = 'webcodecs'
  let drawnCount = 0
  let destroyed = false
  let paused = false
  let firstFrameShown = false
  let lastFrameAt = performance.now()
  let lastDrawnTs: number | null = null
  let lateFrames = 0
  let skippedChunks = 0
  let startOffset = 0
  let lastReceived: number | null = null // pts of the newest video received
  let firstReceived: number | null = null
  let codec = ''
  let decoderResets = 0
  const frames: VideoFrame[] = [] // decoded, waiting for their time
  let pending: { chunk: EncodedVideoChunk; dts: number }[] = [] // received, not yet decoded
  let audioPending: EncodedAudioChunk[] = [] // received, not yet decoded
  // Decoded (or skipped over) already, kept for skips back (KEEP_BEHIND_S): in decode
  // order and contiguous with `pending`, the video starting at a keyframe.
  let pastVideo: { chunk: EncodedVideoChunk; dts: number }[] = []
  let pastAudio: EncodedAudioChunk[] = []
  let audioReady: ReadyAudio[] = [] // decoded, not yet scheduled
  let scheduled: ScheduledAudio[] = [] // handed to WebAudio
  // Recently finished buffers: WebAudio reports a buffer "ended" when the graph is done
  // with it, an output latency before it's heard. Kept briefly for heardMedia().
  let played: ScheduledAudio[] = []
  let audioScheduledCount = 0
  let lastScheduledEnd = 0
  let audioConfig: AacConfig | null = null

  // Statistics: bytes and media seconds received, per arrival, for rates over a window.
  let bytesTotal = 0
  const arrivals: { at: number; bytes: number; media: number | null }[] = []
  const decodeStarted = new Map<number, number>() // chunk timestamp → performance.now()
  const decodeTimes: number[] = []
  let drawnWindow: number[] = [] // performance.now() of recent draws

  // --- clock ---------------------------------------------------------------------------
  let firstPts: number | null = null // media time the stream starts at
  let firstDecodedAt = 0 // performance.now() when the first frame decoded
  let anchorMedia: number | null = null
  let anchorCtx = 0 // heard-time (context seconds) at which anchorMedia plays
  let anchorWall = 0
  let onAudioClock = false
  let pausedMedia = 0
  let skipTarget: number | null = null // skipTo: media time held until its picture is decoded
  let firstAudioPts: number | null = null
  let starved = false // waiting for data with the clock stopped at pausedMedia (REBUFFER_S)
  let rebuffers = 0

  const mediaNow = (): number | null => {
    if (anchorMedia == null) return null
    if (paused || starved) return pausedMedia
    if (skipTarget != null) return skipTarget
    return onAudioClock
      ? anchorMedia + (heardTime(audio) - anchorCtx)
      : anchorMedia + (performance.now() / 1000 - anchorWall)
  }
  /** Takes back whatever WebAudio hasn't played yet, to be rescheduled on a new anchor.
   * `cut`: the media time heard last (a pause); sound before it isn't played again. */
  const unschedule = (cut?: number) => {
    const back: ReadyAudio[] = []
    for (const s of scheduled) {
      s.node.onended = null
      try {
        s.node.stop()
      } catch {
        // never started
      }
      s.node.disconnect()
      const start = s.ts + (s.skip ?? 0)
      if (cut != null && s.ts + s.buffer.duration <= cut) continue
      back.push({ buffer: s.buffer, ts: s.ts, skip: cut != null && start < cut ? cut - s.ts : s.skip })
    }
    scheduled = []
    played = []
    audioReady = [...back, ...audioReady]
    lastScheduledEnd = 0
  }
  const anchor = (media: number) => {
    unschedule()
    anchorMedia = media
    anchorWall = performance.now() / 1000
    onAudioClock = audio.state === 'running'
    // On the audio clock, the picture holds for a moment until sound catches up with it.
    anchorCtx = onAudioClock ? audio.currentTime + AUDIO_START_LEAD_S : 0
  }
  const onAudioState = () => {
    const now = mediaNow()
    if (now != null && !paused && audio.state === 'running' && !onAudioClock) anchor(now) // wall → audio
    cb.onAudioLocked(audio.state !== 'running')
  }
  audio.addEventListener('statechange', onAudioState)

  const fail = (message: string, kind: EngineErrorKind = 'decode', closeCode?: number) => {
    if (!destroyed) cb.onError(message, kind, closeCode)
  }

  /** Moves video off the front of `pending` into the kept past, and drops what's older
   * than KEEP_BEHIND_S (keeping from a keyframe at or before that). */
  const retireVideo = (count: number) => {
    if (count <= 0) return
    pastVideo.push(...pending.splice(0, count))
    const cutoff = pastVideo[pastVideo.length - 1].chunk.timestamp / 1e6 - KEEP_BEHIND_S
    const key = pastVideo.findLastIndex((p) => p.chunk.type === 'key' && p.chunk.timestamp / 1e6 <= cutoff)
    if (key > 0) pastVideo = pastVideo.slice(key)
  }
  const retireAudio = (chunk: EncodedAudioChunk) => {
    pastAudio.push(chunk)
    const cutoff = chunk.timestamp / 1e6 - KEEP_BEHIND_S - 5 // the video's keyframe may be up to a GOP earlier
    let drop = 0
    while (drop < pastAudio.length && pastAudio[drop].timestamp / 1e6 < cutoff) drop++
    if (drop > 64) pastAudio = pastAudio.slice(drop)
  }
  /** The oldest point a skip back can land on: the first kept keyframe, but not before
   * where this stream was asked to start (the picture before that has no sound), or null. */
  const keptFrom = (): number | null => {
    const key = pastVideo.find((p) => p.chunk.type === 'key')
    if (!key || firstPts == null) return null
    return Math.max(key.chunk.timestamp / 1e6, firstPts - startOffset)
  }

  // --- video ---------------------------------------------------------------------------
  const videoDecoder: VideoDecoder = new VideoDecoder({
    output: (frame) => {
      const started = decodeStarted.get(frame.timestamp)
      if (started != null) {
        decodeStarted.delete(frame.timestamp)
        decodeTimes.push(performance.now() - started)
        if (decodeTimes.length > 60) decodeTimes.shift()
      }
      if (destroyed) return frame.close()
      if (skipTarget != null && frame.timestamp / 1e6 < skipTarget - 0.001) return frame.close() // skipped over
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

  /** Feeds the decoders: video up to DECODE_AHEAD_S past the clock (by decode time),
   * audio up to AUDIO_DECODE_AHEAD_S. Before playback starts, video fills the start
   * lead; until the very first frame comes out it feeds freely (bounded by the frame
   * cap), since some decoders want a few inputs before any output — with B-frames,
   * several. */
  const pump = () => {
    const now = mediaNow()
    if (videoDecoder.state === 'configured') {
      if (
        now != null &&
        !paused &&
        lastDrawnTs != null &&
        now - lastDrawnTs > RESET_BEHIND_S &&
        videoDecoder.decodeQueueSize > 0
      ) {
        const key = pending.findLastIndex((p) => p.chunk.type === 'key' && p.dts <= now + DECODE_AHEAD_S)
        if (key >= 0) {
          videoDecoder.reset() // drops everything queued inside the decoder
          videoDecoder.configure({ codec, optimizeForLatency: !opts.reorder })
          for (const f of frames.splice(0)) f.close()
          decodeStarted.clear()
          retireVideo(key)
          skippedChunks += key
          decoderResets++
          lastDrawnTs = null
        }
      }
      if (now != null && !paused && pending.length && pending[0].dts < now - CATCH_UP_S) {
        for (let i = pending.length - 1; i > 0; i--) {
          if (pending[i].chunk.type === 'key' && pending[i].dts <= now + DECODE_AHEAD_S) {
            retireVideo(i)
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
        const { chunk } = pending[0]
        retireVideo(1)
        decodeStarted.set(chunk.timestamp, performance.now())
        if (decodeStarted.size > 120) decodeStarted.delete(decodeStarted.keys().next().value!)
        videoDecoder.decode(chunk)
      }
    }
    if (audioDecoder?.state === 'configured') {
      const base = now ?? firstPts ?? (audioPending.length ? audioPending[0].timestamp / 1e6 : 0)
      const audioHorizon = base + (now == null ? START_LEAD_S + AUDIO_DECODE_AHEAD_S : AUDIO_DECODE_AHEAD_S)
      while (audioPending.length && audioPending[0].timestamp / 1e6 <= audioHorizon) {
        const chunk = audioPending.shift()!
        retireAudio(chunk)
        audioDecoder.decode(chunk)
      }
    }
  }
  videoDecoder.addEventListener('dequeue', pump)

  const onVideo = (s: VideoSample) => {
    if (videoDecoder.state === 'unconfigured') {
      if (!s.key) return // a decoder must start on a keyframe
      // optimizeForLatency: output each frame as soon as it's decoded. Only without
      // B-frames — with them, frames must wait for later ones to come out in order.
      codec = avcCodecString(s.data) ?? H264_CODEC
      videoDecoder.configure({ codec, optimizeForLatency: !opts.reorder })
    }
    lastReceived = Math.max(lastReceived ?? s.pts, s.pts)
    firstReceived ??= s.pts
    pending.push({
      chunk: new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: Math.round(s.pts * 1e6), data: s.data }),
      dts: s.dts,
    })
    pump()
  }

  // --- audio ---------------------------------------------------------------------------
  let audioDecoder: AudioDecoder | null = null
  let audioConfigKey = ''
  const onAudioData = (data: AudioData) => {
    try {
      if (destroyed) return
      const now = mediaNow()
      const end = data.timestamp / 1e6 + data.numberOfFrames / data.sampleRate
      if (now != null && end < now) return // already past: nothing to play it for
      const buffer = audio.createBuffer(data.numberOfChannels, data.numberOfFrames, data.sampleRate)
      for (let ch = 0; ch < data.numberOfChannels; ch++) {
        const plane = new Float32Array(data.numberOfFrames)
        data.copyTo(plane, { planeIndex: ch, format: 'f32-planar' })
        buffer.copyToChannel(plane, ch)
      }
      audioReady.push({ buffer, ts: data.timestamp / 1e6 })
      scheduleAudio()
    } finally {
      data.close()
    }
  }
  /** Hands decoded audio to WebAudio, timed so it's heard when the picture shows the
   * same moment, up to AUDIO_SCHEDULE_AHEAD_S ahead. */
  const scheduleAudio = () => {
    if (destroyed || paused || anchorMedia == null || skipTarget != null) return
    if (!onAudioClock) {
      // Sound is held back (no tap yet): drop what the picture has already passed.
      const now = mediaNow() ?? 0
      while (audioReady.length && audioReady[0].ts + audioReady[0].buffer.duration < now) audioReady.shift()
      return
    }
    const ctxNow = audio.currentTime
    while (audioReady.length) {
      const { buffer, ts, skip = 0 } = audioReady[0]
      let when = anchorCtx + (ts + skip - anchorMedia)
      if (when > ctxNow + AUDIO_SCHEDULE_AHEAD_S) break
      audioReady.shift()
      // Back to back with the previous buffer unless it has drifted noticeably.
      if (lastScheduledEnd && Math.abs(when - lastScheduledEnd) < AUDIO_SNAP_S) when = lastScheduledEnd
      const offset = skip + Math.max(0, ctxNow - when) // partly past: play the rest
      if (offset >= buffer.duration) continue
      const node = audio.createBufferSource()
      node.buffer = buffer
      node.connect(out)
      node.start(Math.max(when, ctxNow), offset)
      // `when` as if the whole buffer had played from its start (for heardMedia).
      const item: ScheduledAudio = { buffer, ts, node, when: when - skip }
      node.onended = () => {
        scheduled = scheduled.filter((s) => s !== item)
        node.disconnect()
        played.push(item)
        const heard = heardTime(audio)
        played = played.filter((p) => p.when + p.buffer.duration > heard - 1)
      }
      scheduled.push(item)
      lastScheduledEnd = when - skip + buffer.duration
      audioScheduledCount++
    }
  }
  const configureAudio = (config: AacConfig) => {
    const key = `${config.sampleRate}/${config.channels}/${config.asc.join(',')}`
    if (key === audioConfigKey && audioDecoder) return
    audioDecoder?.close()
    audioConfigKey = key
    audioConfig = config
    audioDecoder = new AudioDecoder({ output: onAudioData, error: (e) => fail(`audio decoder: ${e.message}`, 'decode') })
    audioDecoder.configure(audioDecoderConfig(config))
  }
  const audioDecoderConfig = (config: AacConfig): AudioDecoderConfig => ({
    codec: AAC_CODEC,
    sampleRate: config.sampleRate,
    numberOfChannels: config.channels,
    description: config.asc,
  })
  const onAudio = (s: AudioSample) => {
    firstAudioPts ??= s.pts
    configureAudio(s.config)
    audioPending.push(new EncodedAudioChunk({ type: 'key', timestamp: Math.round(s.pts * 1e6), data: s.data }))
    pump()
  }

  let demuxer = new TsDemuxer(onVideo, onAudio)

  /** A demuxer for a second connection: its timestamps are moved so its first keyframe
   * lands on `cut`; audio before that point duplicates what's already buffered. */
  const splicedDemuxer = (cut: number) => {
    let shift: number | null = null
    const early: AudioSample[] = []
    const audioAt = (a: AudioSample) => {
      const pts = a.pts + shift!
      if (pts >= cut - 0.001) onAudio({ ...a, pts })
    }
    return new TsDemuxer(
      (v) => {
        if (shift == null) {
          if (!v.key) return
          shift = cut - v.pts
          for (const a of early.splice(0)) audioAt(a)
        }
        onVideo({ ...v, pts: v.pts + shift, dts: v.dts + shift })
      },
      (a) => (shift == null ? early.length < 500 && early.push(a) : audioAt(a)),
    )
  }

  /** Media time of the sound being heard right now, or null when there's none. */
  const heardMedia = (): number | null => {
    const t = heardTime(audio)
    for (const s of [...played, ...scheduled]) {
      if (t >= s.when && t < s.when + s.buffer.duration) return s.ts + (t - s.when)
    }
    return null
  }

  /** Continues from `target`: ahead of the clock within what's received, or behind it
   * within what's kept (KEEP_BEHIND_S). Both wait compressed, so this only uses buffers
   * that are there anyway. A skip back first puts the kept past in front of `pending`
   * again (everything after it is in there too: decoded audio and frames are re-made
   * from it). Decoding restarts at the last keyframe at or before the target (none
   * ahead = the frames being decoded already lead there); what comes out before the
   * target is thrown away, and the clock and the sound hold until the target's picture
   * is ready (render). */
  const jumpTo = (target: number) => {
    const back = target < (mediaNow() ?? target)
    if (back) {
      pending = [...pastVideo, ...pending]
      pastVideo = []
      audioPending = [...pastAudio, ...audioPending]
      pastAudio = []
    }
    const key = pending.findLastIndex((p) => p.chunk.type === 'key' && p.chunk.timestamp / 1e6 <= target)
    if ((key >= 0 || back) && videoDecoder.state === 'configured') {
      videoDecoder.reset()
      videoDecoder.configure({ codec, optimizeForLatency: !opts.reorder })
      decodeStarted.clear()
      retireVideo(key)
      if (!back) skippedChunks += Math.max(0, key)
    }
    for (const f of frames.splice(0)) f.close()
    lastDrawnTs = null
    while (audioPending.length && audioPending[0].timestamp / 1e6 < target - 0.05) retireAudio(audioPending.shift()!)
    if (audioDecoder?.state === 'configured' && audioConfig) {
      // Chrome's AAC decoder times its output by counting on from earlier input: after
      // skipped input everything would come out stamped in the past (and be dropped).
      audioDecoder.reset()
      audioDecoder.configure(audioDecoderConfig(audioConfig))
    }
    unschedule()
    // Back: all of it is decoded again from pastAudio.
    audioReady = back ? [] : audioReady.filter((a) => a.ts + a.buffer.duration > target)
    skipTarget = target
    starved = false // the target is buffered
    lastFrameAt = performance.now() // the stall watchdog counts from here
    pump()
  }

  // --- presentation loop ---------------------------------------------------------------
  let raf = 0
  const render = () => {
    if (destroyed) return
    raf = requestAnimationFrame(render)
    if (anchorMedia == null && firstPts != null) {
      const buffered = frames.length ? frames[frames.length - 1].timestamp / 1e6 - firstPts : 0
      // Wait for the sound's start too (it comes after any picture before it), unless
      // there's evidently none.
      const soundKnown = firstAudioPts != null || (lastReceived ?? firstPts) - firstPts > MAX_PREROLL_S
      // At 60 fps the frame cap holds less than START_LEAD_S: a full queue is enough.
      const full = frames.length + videoDecoder.decodeQueueSize >= MAX_QUEUED_FRAMES
      if (((buffered >= START_LEAD_S || full) && soundKnown) || performance.now() - firstDecodedAt > START_MAX_WAIT_MS) {
        const preroll = firstAudioPts != null ? firstAudioPts - firstPts : 0
        if (preroll > 0.1 && preroll < MAX_PREROLL_S && (lastReceived ?? 0) > firstAudioPts!) {
          const start = firstAudioPts!
          anchor(start)
          jumpTo(start) // the picture before the sound is decoded and dropped
          firstPts = start // elapsed() counts from here: the requested time
        } else anchor(firstPts)
      }
    }
    if (skipTarget != null && !paused && frames.length) {
      anchor(skipTarget) // the target's picture is ready: the clock and the sound go on from it
      skipTarget = null
    }
    if (!paused && skipTarget == null && firstFrameShown && anchorMedia != null && lastReceived != null) {
      const clock = mediaNow()!
      if (!starved && !frames.length && clock > lastReceived + 0.1) {
        starved = true
        rebuffers++
        pausedMedia = clock
        unschedule(clock) // the sound not yet heard is kept for when it goes on
      } else if (starved && lastReceived - pausedMedia >= REBUFFER_S) {
        starved = false
        anchor(pausedMedia)
      }
    }
    pump()
    scheduleAudio()
    const now = mediaNow()
    if (now == null || paused) return
    let due: VideoFrame | null = null
    while (frames.length && frames[0].timestamp / 1e6 <= now + PRESENT_LEAD_S) {
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
    lastDrawnTs = due.timestamp / 1e6
    due.close()
    lastFrameAt = performance.now()
    drawnWindow.push(lastFrameAt)
    if (drawnWindow.length > 120) drawnWindow = drawnWindow.slice(-60)
    canvas.dataset.framesDrawn = String(++drawnCount)
    canvas.dataset.clock = onAudioClock ? 'audio' : 'wall'
    if (!firstFrameShown) {
      firstFrameShown = true
      cb.onFirstFrame()
      cb.onAudioLocked(audio.state !== 'running')
    }
  }
  raf = requestAnimationFrame(render)

  const stats = (): EngineStats => {
    const nowMs = performance.now()
    while (arrivals.length && arrivals[0].at < nowMs - RATE_WINDOW_MS) arrivals.shift()
    const windowBytes = arrivals.reduce((n, a) => n + a.bytes, 0)
    const span = arrivals.length ? Math.max(1000, nowMs - arrivals[0].at) : RATE_WINDOW_MS
    // Media seconds that arrived in the window, against the bytes they took: the stream's
    // own bitrate, and how much faster than real time it's coming in.
    const first = arrivals.find((a) => a.media != null)
    const last = arrivals.at(-1)
    const mediaIn = first && last?.media != null ? last.media - first.media! : 0
    const streamKbps = mediaIn > 0.5 ? Math.round((windowBytes * 8) / mediaIn / 1000) : undefined
    const recent = drawnWindow.filter((t) => t > nowMs - 2000)
    const heard = heardMedia()
    const now = mediaNow()
    return {
      framesDrawn: drawnCount,
      framesLate: lateFrames,
      framesQueued: frames.length,
      chunksPending: pending.length,
      chunksSkipped: skippedChunks,
      decoderResets,
      audioScheduled: audioScheduledCount,
      videoWidth: drawnCount ? canvas.width : 0,
      videoHeight: drawnCount ? canvas.height : 0,
      codec,
      fps: recent.length / 2,
      bytesReceived: bytesTotal,
      receiveKbps: Math.round((windowBytes * 8) / span),
      streamKbps,
      realtime: arrivals.length ? Math.round((mediaIn / (span / 1000)) * 100) / 100 : undefined,
      bufferAheadS: lastReceived == null ? 0 : Math.max(0, lastReceived - (now ?? firstPts ?? lastReceived)),
      bufferBehindS: (() => {
        const from = keptFrom()
        return from == null || now == null ? 0 : Math.max(0, now - from)
      })(),
      decodeMs: decodeTimes.length ? decodeTimes.reduce((a, b) => a + b, 0) / decodeTimes.length : undefined,
      decodeQueue: videoDecoder.state === 'configured' ? videoDecoder.decodeQueueSize : 0,
      videoBehindMs: now != null && lastDrawnTs != null && !paused ? Math.round((now - lastDrawnTs) * 1000) : undefined,
      avOffsetMs: heard != null && lastDrawnTs != null ? Math.round((lastDrawnTs - heard) * 1000) : undefined,
      outputLatencyMs: Math.round(((audio.outputLatency || 0) + (audio.baseLatency || 0)) * 1000),
      audioClock: onAudioClock ? 'audio' : 'wall',
      rebuffers,
      audioFormat: audioConfig ? `AAC ${audioConfig.sampleRate / 1000} kHz ${audioConfig.channels} ch` : undefined,
      audioBufferedS: audioReady.reduce((n, a) => n + a.buffer.duration, 0) + audioPending.length * 0.021,
      ...pipeline.inputStats,
    }
  }

  const pipeline: Pipeline = {
    push: (bytes) => {
      if (destroyed) return
      if (starved) lastFrameAt = performance.now() // data still coming: not a stall
      bytesTotal += bytes.length
      try {
        demuxer.push(bytes)
      } catch (err) {
        fail(`demux: ${err instanceof Error ? err.message : String(err)}`, 'decode')
      }
      arrivals.push({ at: performance.now(), bytes: bytes.length, media: lastReceived })
      if (arrivals.length > 4000) arrivals.splice(0, 2000)
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
    get paused() {
      return paused
    },
    onDestroy: null,
    canResume: () => true,
    receivedRange: () => (firstReceived == null || lastReceived == null ? null : { first: firstReceived, last: lastReceived }),
    spliceAt: (cut) => {
      demuxer.flush()
      const keep = (ts: number) => ts < cut - 0.001
      for (let i = pending.length - 1; i >= 0; i--) if (!keep(pending[i].chunk.timestamp / 1e6)) pending.splice(i, 1)
      for (let i = audioPending.length - 1; i >= 0; i--) if (!keep(audioPending[i].timestamp / 1e6)) audioPending.splice(i, 1)
      audioReady = audioReady.filter((a) => keep(a.ts))
      lastReceived = Math.min(lastReceived ?? cut, cut)
      demuxer = splicedDemuxer(cut)
    },
    inputStats: {},
    buffering: () => starved,
    elapsed: () => {
      const now = mediaNow()
      return now == null || firstPts == null ? 0 : now - firstPts + startOffset
    },
    lastFrameAt: () => lastFrameAt,
    setVolume: (volume) => {
      out.gain.value = volume
    },
    stats,
    unlockAudio: () => {
      if (audio.state !== 'running') void audio.resume()
    },
    skipTo: (elapsed) => {
      // Not while paused (the player drops the stream then) or before playback started.
      const now = mediaNow()
      if (destroyed || paused || now == null || firstPts == null || lastReceived == null) return false
      const target = elapsed + firstPts - startOffset
      if (videoDecoder.state !== 'configured') return false
      if (target < now) {
        const from = keptFrom()
        if (from == null || target < from) return false // further back than what's kept
      } else if (target === now || lastReceived - target < SKIP_MIN_LEFT_S) return false
      jumpTo(target)
      return true
    },
    pause: () => {
      if (paused || destroyed) return
      pausedMedia = mediaNow() ?? firstPts ?? 0
      starved = false // playing again checks the buffer anew
      skipTarget = null // playing again starts from pausedMedia (= the target)
      paused = true
      unschedule(pausedMedia) // silence at once; the sound not yet heard is kept for later
    },
    resume: () => {
      if (destroyed) return false
      if (!paused) return true
      if (!pipeline.canResume()) return false
      paused = false
      if (anchorMedia != null) anchor(pausedMedia)
      lastFrameAt = performance.now() // the stall watchdog counts from here
      return true
    },
    destroy: () => {
      if (destroyed) return
      destroyed = true
      cancelAnimationFrame(raf)
      audio.removeEventListener('statechange', onAudioState)
      pipeline.onDestroy?.()
      unschedule()
      out.disconnect() // silences audio already scheduled ahead
      for (const f of frames.splice(0)) f.close()
      pending = []
      audioPending = []
      pastVideo = []
      pastAudio = []
      audioReady = []
      if (videoDecoder.state !== 'closed') videoDecoder.close()
      if (audioDecoder && audioDecoder.state !== 'closed') audioDecoder.close()
    },
  }
  return pipeline
}

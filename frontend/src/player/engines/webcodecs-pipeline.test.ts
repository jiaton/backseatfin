import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { createPipeline, type Pipeline } from './webcodecs-pipeline'

// 0.5 s of picture and sound starting together (the server's re-encoded format)…
const tiny = new Uint8Array(readFileSync(join(__dirname, '__fixtures__/tiny.mpegts')))
// …and 1 s of picture whose sound starts 0.4 s in, like a stream with copied video
// asked to start between two keyframes (ffmpeg -itsoffset 0.4 on the sound).
const preroll = new Uint8Array(readFileSync(join(__dirname, '__fixtures__/preroll.mpegts')))

const FRAME_US = (1024 / 48000) * 1e6

/** Chrome's AudioDecoder, as measured in Chromium (2026-11): output timestamps count on
 * from the first input after configure/reset/flush; later input timestamps are ignored. */
class ChromeLikeAudioDecoder {
  static last: ChromeLikeAudioDecoder
  state = 'unconfigured'
  inputs: number[] = []
  outputs: number[] = []
  private base: number | null = null
  private count = 0
  private init: { output: (d: unknown) => void }
  constructor(init: { output: (d: unknown) => void }) {
    this.init = init
    ChromeLikeAudioDecoder.last = this
  }
  configure() {
    this.state = 'configured'
    this.base = null
  }
  reset() {
    this.state = 'unconfigured'
    this.base = null
  }
  flush() {
    this.base = null // the next input sets the timestamps again
    return Promise.resolve()
  }
  close() {
    this.state = 'closed'
  }
  decode(chunk: { timestamp: number }) {
    this.inputs.push(chunk.timestamp)
    if (this.base == null) {
      this.base = chunk.timestamp
      this.count = 0
    }
    const timestamp = Math.round(this.base + this.count++ * FRAME_US)
    this.outputs.push(timestamp)
    this.init.output({ timestamp, numberOfFrames: 1024, numberOfChannels: 2, sampleRate: 48000, copyTo() {}, close() {} })
  }
}

class FakeVideoDecoder {
  static last: FakeVideoDecoder
  state = 'unconfigured'
  decodeQueueSize = 0
  inputs: number[] = []
  private init: { output: (f: unknown) => void }
  constructor(init: { output: (f: unknown) => void }) {
    this.init = init
    FakeVideoDecoder.last = this
  }
  configure() {
    this.state = 'configured'
  }
  reset() {
    this.state = 'unconfigured'
  }
  close() {
    this.state = 'closed'
  }
  addEventListener() {}
  decode(chunk: { timestamp: number }) {
    this.inputs.push(chunk.timestamp)
    this.init.output({ timestamp: chunk.timestamp, displayWidth: 64, displayHeight: 64, close() {} })
  }
}

class FakeChunk {
  type: string
  timestamp: number
  duration?: number
  constructor(init: { type: string; timestamp: number; duration?: number }) {
    this.type = init.type
    this.timestamp = init.timestamp
    this.duration = init.duration
  }
}

const node = () => ({ connect() {}, disconnect() {}, gain: { value: 1 } })
class FakeAudioContext {
  state = 'suspended' // no tap yet: nothing is scheduled, the decoders are what's tested
  currentTime = 0
  destination = {}
  createGain = node
  createBuffer = (_ch: number, frames: number, rate: number) => ({ duration: frames / rate, copyToChannel() {} })
  addEventListener() {}
  removeEventListener() {}
}

let pipeline: Pipeline | null = null
beforeEach(() => {
  vi.stubGlobal('AudioDecoder', ChromeLikeAudioDecoder)
  vi.stubGlobal('VideoDecoder', FakeVideoDecoder)
  vi.stubGlobal('EncodedAudioChunk', FakeChunk)
  vi.stubGlobal('EncodedVideoChunk', FakeChunk)
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('requestAnimationFrame', () => 0) // the clock never starts: nothing is dropped as past
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => {
  pipeline?.destroy()
  pipeline = null
  vi.unstubAllGlobals()
})

const create = () => {
  const canvas = { getContext: () => null, dataset: {} } as unknown as HTMLCanvasElement
  const cb = { onFirstFrame() {}, onError() {}, onAudioLocked() {} }
  pipeline = createPipeline(canvas, cb as never)
  return pipeline
}

/** Each output stamped with its input's time (to rounding). */
const expectStampedRight = (d: ChromeLikeAudioDecoder) => {
  expect(d.outputs).toHaveLength(d.inputs.length)
  d.outputs.forEach((t, i) => expect(Math.abs(t - d.inputs[i])).toBeLessThan(5))
}
const gaps = (ts: number[]) => ts.slice(1).map((t, i) => t - ts[i] - FRAME_US)

it('a spliced stream with copied video goes on with sound: no gap in the input, output stamped right', () => {
  const p = create()
  p.push(tiny)
  const decoder = ChromeLikeAudioDecoder.last
  const before = decoder.inputs.length
  const at = p.splice()
  // The new stream is asked from where the received sound ends (0.5 s of sound in tiny).
  expect(at).toBeCloseTo((decoder.inputs.at(-1)! + FRAME_US) / 1e6 - FakeVideoDecoder.last.inputs[0] / 1e6, 3)
  p.push(preroll)
  p.flush()
  expect(decoder.inputs.length).toBeGreaterThan(before + 20) // the new sound was decoded
  // Regression: the new stream was placed by its keyframe, so its sound (0.4 s later)
  // left a 0.4 s jump in the input; Chrome's decoder stamped all later sound 0.4 s
  // early (after a long jump, everything was dropped as past: sound gone, picture on).
  gaps(decoder.inputs).forEach((g) => expect(Math.abs(g)).toBeLessThan(1))
  expectStampedRight(decoder)
})

it('a jump in the sound input re-times the decoder instead of shifting all later sound', () => {
  const p = create()
  p.push(tiny)
  p.push(preroll) // a second stream with its own timestamps, not spliced: sound jumps
  p.flush()
  const decoder = ChromeLikeAudioDecoder.last
  expect(gaps(decoder.inputs).some((g) => Math.abs(g) > 100_000)).toBe(true)
  expectStampedRight(decoder)
  expect(p.stats().audioJumps).toBe(1)
})

it('the new picture never replaces frames already handed to the decoder', () => {
  const p = create()
  p.push(tiny) // all of it is decoded at once (the clock hasn't started)
  const video = FakeVideoDecoder.last
  const fed = video.inputs.length
  const newest = Math.max(...video.inputs)
  p.splice()
  p.push(preroll)
  p.flush()
  // preroll's only keyframe would land 0.4 s before the cut, among frames decoded
  // already: it's skipped (the picture waits for a later keyframe), never fed out of order.
  expect(video.inputs.slice(fed).every((t) => t > newest)).toBe(true)
})

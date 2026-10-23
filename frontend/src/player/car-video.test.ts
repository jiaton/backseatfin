import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CarVideoElement, defineCarVideo, OUTAGE_GIVE_UP_MS, RETRY_DELAY_MS, SEEK_SETTLE_MS, STALL_MS, START_TIMEOUT_MS } from './car-video'
import type { EngineCallbacks, EngineKind, StreamEngine } from './engines/types'

interface FakeEngine extends StreamEngine {
  kind: EngineKind
  url: string
  cb: EngineCallbacks
  destroyed: boolean
  elapsedValue: number
  lastFrame: number
}

let engines: FakeEngine[] = []
const original = CarVideoElement.engineFactory

function setup(duration = 3600, start = 100) {
  defineCarVideo()
  const v = document.createElement('car-video')
  document.body.append(v)
  v.source = { url: (t, kind) => `ws://x/?t=${Math.floor(t)}&f=${kind}`, duration, start }
  const events: string[] = []
  for (const t of ['play', 'playing', 'pause', 'waiting', 'seeking', 'seeked', 'ended', 'error', 'enginechange']) {
    v.addEventListener(t, () => events.push(t))
  }
  return { v, events }
}

const latest = () => engines[engines.length - 1]
const flush = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
  vi.useFakeTimers()
  engines = []
  CarVideoElement.engineFactory = (kind, _canvas, url, cb) => {
    const e: FakeEngine = {
      kind, url, cb, destroyed: false, elapsedValue: 0, lastFrame: performance.now(),
      elapsed: () => e.elapsedValue,
      lastFrameAt: () => e.lastFrame,
      unlockAudio: () => {},
      setVolume: () => {},
      stats: () => ({ framesDrawn: 0 }),
      destroy: () => {
        e.destroyed = true
      },
    }
    engines.push(e)
    return Promise.resolve(e)
  }
})

afterEach(() => {
  CarVideoElement.engineFactory = original
  document.body.replaceChildren()
  vi.useRealTimers()
})

describe('<car-video>', () => {
  it('plays from the source start and reports playing on the first frame', async () => {
    const { v, events } = setup()
    expect(v.paused).toBe(true)
    await v.play()
    await flush()
    expect(latest().url).toBe('ws://x/?t=100&f=webcodecs')
    expect(events).toEqual(['play', 'waiting'])
    latest().cb.onFirstFrame()
    expect(v.readyState).toBe(4)
    expect(events.at(-1)).toBe('playing')
    latest().elapsedValue = 12.5
    expect(v.currentTime).toBe(112.5)
  })

  it('coalesces rapid seeks into one stream at the last target', async () => {
    const { v } = setup()
    await v.play()
    await flush()
    latest().cb.onFirstFrame()
    const first = latest()
    v.currentTime = 200
    v.currentTime = 230
    v.currentTime = 260
    expect(first.destroyed).toBe(true) // the old stream stops at once
    expect(v.currentTime).toBe(260)
    await vi.advanceTimersByTimeAsync(SEEK_SETTLE_MS + 1)
    expect(engines).toHaveLength(2)
    expect(latest().url).toContain('t=260')
  })

  it('emits seeked when the new stream shows its first frame', async () => {
    const { v, events } = setup()
    await v.play()
    await flush()
    latest().cb.onFirstFrame()
    v.currentTime = 500
    await vi.advanceTimersByTimeAsync(SEEK_SETTLE_MS + 1)
    expect(v.seeking).toBe(true)
    latest().cb.onFirstFrame()
    expect(v.seeking).toBe(false)
    expect(events.slice(-2)).toEqual(['seeked', 'playing'])
  })

  it('pause stops the stream and play resumes where it was', async () => {
    const { v } = setup()
    await v.play()
    await flush()
    latest().cb.onFirstFrame()
    latest().elapsedValue = 30
    v.pause()
    expect(latest().destroyed).toBe(true)
    expect(v.currentTime).toBe(130)
    await v.play()
    await flush()
    expect(latest().url).toContain('t=130')
  })

  it('a stalled stream is resumed at the current position', async () => {
    const { v } = setup()
    await v.play()
    await flush()
    const e = latest()
    e.cb.onFirstFrame()
    e.elapsedValue = 40
    e.lastFrame = performance.now()
    await vi.advanceTimersByTimeAsync(STALL_MS + 500)
    expect(e.destroyed).toBe(true)
    expect(latest()).not.toBe(e)
    expect(latest().url).toContain('t=140')
  })

  it('a stall near the end is the end', async () => {
    const { v, events } = setup(150, 100)
    await v.play()
    await flush()
    const e = latest()
    e.cb.onFirstFrame()
    e.elapsedValue = 45 // 145 of 150
    await vi.advanceTimersByTimeAsync(STALL_MS + 500)
    expect(v.ended).toBe(true)
    expect(v.paused).toBe(true)
    expect(events).toContain('ended')
    expect(engines).toHaveLength(1)
  })

  it('falls back from WebCodecs to JSMpeg once on a decode error, then reports errors', async () => {
    const { v, events } = setup()
    await v.play()
    await flush()
    latest().elapsedValue = 5
    latest().cb.onError('bad decoder', 'decode')
    await flush()
    expect(events).toContain('enginechange')
    expect(v.engine).toBe('jsmpeg')
    expect(latest().url).toBe('ws://x/?t=105&f=jsmpeg')
    latest().cb.onError('also bad', 'decode')
    expect(v.error?.message).toBe('also bad')
    expect(v.paused).toBe(true)
  })

  it('a connection error is shown, not retried with another engine', async () => {
    const { v, events } = setup()
    await v.play()
    await flush()
    latest().cb.onError('server error', 'connection', 1011)
    expect(events.at(-2)).toBe('error')
    expect(v.error).toMatchObject({ reason: 'refused', closeCode: 1011 })
    expect(v.engine).toBe('webcodecs')
    v.reload()
    await flush()
    expect(v.error).toBeNull()
    expect(latest().destroyed).toBe(false)
  })

  it('rides out a network outage: retries in place, then plays on', async () => {
    const { v, events } = setup()
    await v.play()
    await flush()
    latest().cb.onFirstFrame()
    latest().elapsedValue = 60
    latest().cb.onError('连接关闭', 'network') // e.g. the stall reconnect hit a dead zone
    expect(v.retrying).toBe(true)
    expect(v.error).toBeNull()
    expect(events).toContain('waiting')
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS + 1)
    expect(latest().url).toContain('t=160')
    latest().cb.onError('连接关闭', 'network')
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS + 1)
    latest().cb.onFirstFrame()
    expect(v.retrying).toBe(false)
    expect(v.paused).toBe(false)
    expect(v.error).toBeNull()
  })

  it('a hanging connect during an outage is retried, and the outage is given up on eventually', async () => {
    const { v } = setup()
    await v.play()
    await flush()
    latest().cb.onError('连接关闭', 'network')
    // From here on every attempt hangs (no first frame, no close).
    await vi.advanceTimersByTimeAsync(OUTAGE_GIVE_UP_MS + 15_000)
    expect(engines.length).toBeGreaterThan(5)
    expect(v.error?.reason).toBe('outage')
    expect(v.paused).toBe(true)
  })

  it('gives up when no first frame arrives in time', async () => {
    const { v } = setup()
    await v.play()
    await flush()
    await vi.advanceTimersByTimeAsync(START_TIMEOUT_MS + 500)
    expect(v.error?.reason).toBe('timeout')
  })

  it('ignores callbacks from a stream it already replaced', async () => {
    const { v, events } = setup()
    await v.play()
    await flush()
    const old = latest()
    v.reload()
    await flush()
    old.cb.onError('late error', 'connection')
    old.cb.onFirstFrame()
    expect(v.error).toBeNull()
    expect(events).not.toContain('playing')
  })

  it('exposes duration as a seekable range', () => {
    const { v } = setup(3600)
    expect(v.seekable.length).toBe(1)
    expect(v.seekable.end(0)).toBe(3600)
  })
})

describe('<car-video> holding the stream on pause', () => {
  // An engine that can freeze in place (WebCodecs, HLS).
  function holdable(resumeOk = true) {
    const base = CarVideoElement.engineFactory
    CarVideoElement.engineFactory = async (...args) => {
      const e = (await base(...args)) as FakeEngine & { pause(): void; resume(): boolean; pausedNow: boolean }
      e.pausedNow = false
      e.pause = () => void (e.pausedNow = true)
      e.resume = () => {
        e.pausedNow = false
        return resumeOk
      }
      return e
    }
  }

  async function playing() {
    const { v, events } = setup()
    await v.play()
    await flush()
    latest().cb.onFirstFrame()
    latest().elapsedValue = 30
    return { v, events }
  }

  it('pause keeps the stream; play continues it without reconnecting', async () => {
    holdable()
    const { v, events } = await playing()
    const e = latest()
    v.pause()
    expect(e.destroyed).toBe(false)
    expect(v.paused).toBe(true)
    expect(v.currentTime).toBe(130)
    await v.play()
    expect(engines).toHaveLength(1)
    expect(events.slice(-2)).toEqual(['play', 'playing'])
    expect(v.paused).toBe(false)
  })

  it('reconnects when the held stream gave up while paused', async () => {
    holdable(false)
    const { v } = await playing()
    v.pause()
    await v.play()
    await flush()
    expect(engines).toHaveLength(2)
    expect(engines[0].destroyed).toBe(true)
    expect(latest().url).toContain('t=130')
  })

  it('seeking, a new choice or leaving lets the held stream go', async () => {
    holdable()
    const { v } = await playing()
    v.pause()
    v.currentTime = 500
    expect(engines[0].destroyed).toBe(true)
    await v.play()
    await flush()
    expect(latest().url).toContain('t=500')
    latest().cb.onFirstFrame()
    v.pause()
    v.reload() // e.g. another audio track: the held stream has the old URL
    await flush()
    expect(engines).toHaveLength(3)
    latest().cb.onFirstFrame()
    v.stop()
    expect(latest().destroyed).toBe(true)
    expect(v.paused).toBe(true)
  })

  it('a held stream failing while paused is dropped quietly', async () => {
    holdable()
    const { v, events } = await playing()
    v.pause()
    latest().cb.onError('connection closed', 'network')
    expect(latest().destroyed).toBe(true)
    expect(v.error).toBeNull()
    expect(events).not.toContain('retrying')
    expect(v.currentTime).toBe(130)
  })
})

describe('<car-video> seeking within the buffer', () => {
  /** An engine whose buffer reaches `bufferedTo` seconds of elapsed time. */
  function skippable(bufferedTo: number) {
    const base = CarVideoElement.engineFactory
    CarVideoElement.engineFactory = async (...args) => {
      const e = (await base(...args)) as FakeEngine
      e.skipTo = (elapsed) => {
        if (elapsed <= e.elapsedValue || elapsed > bufferedTo) return false
        e.elapsedValue = elapsed
        return true
      }
      return e
    }
  }

  async function playing() {
    const { v, events } = setup()
    await v.play()
    await flush()
    latest().cb.onFirstFrame()
    latest().elapsedValue = 30
    return { v, events }
  }

  it('a jump forward into the buffer skips ahead without a new stream', async () => {
    skippable(50)
    const { v, events } = await playing()
    v.currentTime = 140 // 130 + 10 s, buffered to 150
    await vi.advanceTimersByTimeAsync(SEEK_SETTLE_MS + 1)
    expect(engines).toHaveLength(1)
    expect(latest().destroyed).toBe(false)
    expect(v.currentTime).toBe(140)
    expect(v.seeking).toBe(false)
    expect(events.slice(-2)).toEqual(['seeking', 'seeked'])
  })

  it('past the buffer, or backwards, opens a new stream as before', async () => {
    skippable(50)
    const { v } = await playing()
    v.currentTime = 200
    await vi.advanceTimersByTimeAsync(SEEK_SETTLE_MS + 1)
    expect(engines).toHaveLength(2)
    expect(latest().url).toContain('t=200')
    latest().cb.onFirstFrame()
    v.currentTime = 190
    await vi.advanceTimersByTimeAsync(SEEK_SETTLE_MS + 1)
    expect(engines).toHaveLength(3)
    expect(latest().url).toContain('t=190')
  })
})

describe('<car-video> waiting for data', () => {
  it('reports waiting while the engine buffers and playing after, without reconnecting', async () => {
    let buffering = false
    const base = CarVideoElement.engineFactory
    CarVideoElement.engineFactory = async (...args) => {
      const e = (await base(...args)) as FakeEngine
      e.buffering = () => buffering
      return e
    }
    const { v, events } = setup()
    await v.play()
    await flush()
    latest().cb.onFirstFrame()
    buffering = true
    await vi.advanceTimersByTimeAsync(300)
    expect(v.buffering).toBe(true)
    expect(events.at(-1)).toBe('waiting')
    buffering = false
    await vi.advanceTimersByTimeAsync(300)
    expect(v.buffering).toBe(false)
    expect(events.at(-1)).toBe('playing')
    expect(engines).toHaveLength(1)
  })
})

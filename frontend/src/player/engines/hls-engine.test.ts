import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchSegment, SEGMENT_STALL_MS, sleep, transferred } from './hls-engine'
import type { Pipeline } from './webcodecs-pipeline'

afterEach(() => vi.useRealTimers())

it('sleep leaves no listener behind on the abort signal (it polls for hours)', async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  const add = vi.spyOn(controller.signal, 'addEventListener')
  const remove = vi.spyOn(controller.signal, 'removeEventListener')
  for (let i = 0; i < 3; i++) {
    const p = sleep(250, controller.signal)
    await vi.advanceTimersByTimeAsync(250)
    await p
  }
  expect(add).toHaveBeenCalledTimes(3)
  expect(remove).toHaveBeenCalledTimes(3)
})

it('sleep rejects at once when the engine stops', async () => {
  const controller = new AbortController()
  const p = sleep(60_000, controller.signal)
  controller.abort(new Error('stopped'))
  await expect(p).rejects.toThrow('stopped')
})

it('small segments are measured together, once there is enough for a measurement', () => {
  const pipeline = { inputStats: {} } as unknown as Pipeline
  transferred(pipeline, 400_000, 400) // 450 KB in 0.4 s: too short alone
  expect(pipeline.inputStats.networkSamples).toBeUndefined()
  transferred(pipeline, 400_000, 400)
  transferred(pipeline, 400_000, 300) // 1.2 MB in 1.1 s
  expect(pipeline.inputStats).toMatchObject({ networkSamples: 1, networkKbps: Math.round((1_200_000 * 8) / 1100) })
  transferred(pipeline, 2_000_000, 1500) // a big one on its own
  expect(pipeline.inputStats).toMatchObject({ networkSamples: 2, networkKbps: Math.round((2_000_000 * 8) / 1500) })
})

describe('fetchSegment', () => {
  afterEach(() => vi.unstubAllGlobals())

  const bytes = (from: number, n: number) => Uint8Array.from({ length: n }, (_, i) => (from + i) % 256)

  it('a request that stalls halfway is retried, and continues where it stopped', async () => {
    vi.useFakeTimers()
    const whole = bytes(0, 1000)
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      calls++
      const first = calls === 1
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(whole.subarray(0, 400))
          if (first) {
            init.signal?.addEventListener('abort', () => c.error(init.signal!.reason)) // then nothing: stuck
          } else {
            c.enqueue(whole.subarray(400))
            c.close()
          }
        },
      })
      return new Response(body)
    }))
    const got: number[] = []
    const pipeline = { push: (b: Uint8Array) => got.push(...b), inputStats: {} } as unknown as Pipeline
    const done = fetchSegment(pipeline, 'https://jf.example.com/seg/1.ts', {}, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(SEGMENT_STALL_MS + 2000)
    await done
    expect(calls).toBe(2)
    expect(got).toEqual(Array.from(whole)) // no gap, no repeat
  })

  it('keeps retrying a failing segment while the buffer covers it, then gives up', async () => {
    vi.useFakeTimers()
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls++
      throw new TypeError('Failed to fetch') // network down
    }))
    let buffered = 20
    const pipeline = { push: () => {}, inputStats: {}, bufferedAhead: () => buffered } as unknown as Pipeline
    const done = fetchSegment(pipeline, 'https://jf.example.com/seg/1.ts', {}, new AbortController().signal)
    const failed = done.then(() => 'resolved', () => 'failed')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(calls).toBeGreaterThan(10) // still trying: the buffer plays on
    buffered = 0 // the buffer ran out: three more tries, then the player reconnects
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await failed).toBe('failed')
  })
})

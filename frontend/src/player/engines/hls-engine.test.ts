import { afterEach, expect, it, vi } from 'vitest'

import { sleep } from './hls-engine'

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

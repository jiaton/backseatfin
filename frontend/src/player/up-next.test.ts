import { afterEach, expect, it, vi } from 'vitest'

import { translator } from './i18n'
import { createUpNext, offerNext, UP_NEXT_S } from './up-next'

afterEach(() => vi.useRealTimers())

it('counts down and plays the next video, unless cancelled', () => {
  vi.useFakeTimers()
  const t = translator('en')
  const up = createUpNext()
  const play = vi.fn()
  up.show(t, 'Spring', play)
  expect(up.el.hidden).toBe(false)
  expect(up.el.textContent).toContain(`Up next in ${UP_NEXT_S} s`)
  vi.advanceTimersByTime(3000)
  expect(up.el.textContent).toContain(`Up next in ${UP_NEXT_S - 3} s`)
  vi.advanceTimersByTime(UP_NEXT_S * 1000)
  expect(play).toHaveBeenCalledOnce()
  expect(up.el.hidden).toBe(true)

  const never = vi.fn()
  up.show(t, 'Charge', never)
  ;(up.el.querySelectorAll('button')[1] as HTMLButtonElement).click() // Cancel
  vi.advanceTimersByTime(UP_NEXT_S * 2000)
  expect(never).not.toHaveBeenCalled()
})

it('offers the next video after one that will not play, on a tap only', async () => {
  const t = translator('en')
  const into = document.createElement('main')
  const play = vi.fn()
  const stop = vi.fn()
  await offerNext(into, t, async () => ({ title: 'Spring', play }), stop)
  const button = into.querySelector('button')
  expect(button?.textContent).toBe('Play the next one: Spring')
  expect(play).not.toHaveBeenCalled() // nothing skips by itself
  button?.click()
  expect(stop).toHaveBeenCalledOnce()
  expect(play).toHaveBeenCalledOnce()

  // Shown again (another error): one button, not two.
  await offerNext(into, t, async () => ({ title: 'Summer', play }))
  expect(into.querySelectorAll('button')).toHaveLength(1)
})

it('offers nothing at the end of the list or when asking fails', async () => {
  const t = translator('en')
  const into = document.createElement('main')
  await offerNext(into, t, async () => null)
  await offerNext(into, t, () => Promise.reject(new Error('offline')))
  expect(into.querySelector('button')).toBeNull()
})

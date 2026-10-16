import { afterEach, expect, it, vi } from 'vitest'

import { translator } from './i18n'
import { createUpNext, UP_NEXT_S } from './up-next'

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

import { describe, expect, it } from 'vitest'

import { MEDIA_SERVER_LEVELS } from './quality'
import { createQualityAdvisor, SNOOZE_MS } from './quality-advisor'

const levels = () => MEDIA_SERVER_LEVELS.Emby // low 1.0, medium 3.0, high 4.0, max 6.0 Mbps

/** Feeds samples every 2 s from `from` ms; each with a fresh network measurement. */
function feed(advisor: ReturnType<typeof createQualityAdvisor>, from: number, seconds: number, s: { buffering: boolean | ((t: number) => boolean); kbps: number }, current: 'low' | 'medium' | 'high' | 'max', counter: { n: number }) {
  let advice = null
  for (let t = from; t < from + seconds * 1000; t += 2000) {
    counter.n++
    const buffering = typeof s.buffering === 'function' ? s.buffering(t) : s.buffering
    advice = advisor.sample({ at: t, buffering, networkKbps: s.kbps, networkSamples: counter.n }, current) ?? advice
  }
  return advice
}

describe('quality advice', () => {
  it('a smooth stream gets no advice', () => {
    const a = createQualityAdvisor(levels)
    expect(feed(a, 0, 120, { buffering: false, kbps: 1700 }, 'medium', { n: 0 })).toBeNull()
  })

  it('one long wait for data offers the highest level the network carries', () => {
    // The car on 2026-10-23: Standard (3 Mbps) over a 1.7 Mbps link.
    const a = createQualityAdvisor(levels)
    expect(feed(a, 0, 8, { buffering: true, kbps: 1700 }, 'medium', { n: 0 })).toEqual({ to: 'low', direction: 'down' })
    // 5 Mbps measured but stalling at Max: High (4 Mbps) fits, Standard isn't needed.
    const b = createQualityAdvisor(levels)
    expect(feed(b, 0, 8, { buffering: true, kbps: 5200 }, 'max', { n: 0 })).toEqual({ to: 'high', direction: 'down' })
  })

  it('two short waits within 90 s count too; one short one does not', () => {
    const a = createQualityAdvisor(levels)
    const c = { n: 0 }
    expect(feed(a, 0, 30, { buffering: (t) => t === 10_000, kbps: 1700 }, 'medium', c)).toBeNull()
    expect(feed(a, 30_000, 30, { buffering: (t) => t === 40_000, kbps: 1700 }, 'medium', c)).toEqual({ to: 'low', direction: 'down' })
  })

  it('a withdrawn "lower" hint forgets the waits before it (a bad patch, not a slow link)', () => {
    const a = createQualityAdvisor(levels)
    const c = { n: 0 }
    expect(feed(a, 0, 8, { buffering: true, kbps: 300 }, 'medium', c)).toEqual({ to: 'low', direction: 'down' })
    a.recovered(8000)
    expect(feed(a, 8000, 60, { buffering: false, kbps: 5000 }, 'medium', c)).toBeNull()
  })

  it('nothing lower than the lowest', () => {
    const a = createQualityAdvisor(levels)
    expect(feed(a, 0, 10, { buffering: true, kbps: 500 }, 'low', { n: 0 })).toBeNull()
  })

  it('after taking "lower", offers going back up once the network clearly carries it, never above where it was', () => {
    const a = createQualityAdvisor(levels)
    const c = { n: 0 }
    expect(a.probing('medium')).toBe(false) // nothing to go back up to
    a.taken({ to: 'low', direction: 'down' }, 'medium', 0)
    expect(a.probing('low')).toBe(true) // measure, to know when going back up fits
    // Calm but only 3.5 Mbps: Standard needs 3 × 1.5 = 4.5.
    expect(feed(a, 0, 150, { buffering: false, kbps: 3500 }, 'low', c)).toBeNull()
    expect(feed(a, 150_000, 20, { buffering: false, kbps: 8000 }, 'low', c)).toEqual({ to: 'medium', direction: 'up' })
    a.taken({ to: 'medium', direction: 'up' }, 'low', 170_000)
    expect(feed(a, 170_000, 200, { buffering: false, kbps: 20000 }, 'medium', c)).toBeNull() // back where it was
    expect(a.probing('medium')).toBe(false)
  })

  it('not up within 2 minutes of stepping down, however good the network looks', () => {
    const a = createQualityAdvisor(levels)
    const c = { n: 0 }
    a.taken({ to: 'low', direction: 'down' }, 'medium', 0)
    expect(feed(a, 0, 118, { buffering: false, kbps: 20000 }, 'low', c)).toBeNull()
    expect(feed(a, 118_000, 4, { buffering: false, kbps: 20000 }, 'low', c)).toEqual({ to: 'medium', direction: 'up' })
  })

  it('not up again soon after a wait for data', () => {
    const a = createQualityAdvisor(levels)
    const c = { n: 0 }
    a.taken({ to: 'low', direction: 'down' }, 'medium', 0)
    feed(a, 0, 2, { buffering: true, kbps: 8000 }, 'low', c)
    expect(feed(a, 2000, 100, { buffering: false, kbps: 8000 }, 'low', c)).toBeNull()
    expect(feed(a, 130_000, 10, { buffering: false, kbps: 8000 }, 'low', c)).toEqual({ to: 'medium', direction: 'up' })
  })

  it('a picked quality is the viewer\'s own; advice let pass waits a while', () => {
    const a = createQualityAdvisor(levels)
    const c = { n: 0 }
    a.taken({ to: 'low', direction: 'down' }, 'medium', 0)
    a.reset()
    expect(feed(a, 0, 200, { buffering: false, kbps: 20000 }, 'low', c)).toBeNull()
    const b = createQualityAdvisor(levels)
    const advice = feed(b, 0, 8, { buffering: true, kbps: 1700 }, 'medium', c)!
    b.snooze(advice, 8000)
    expect(feed(b, 8000, 60, { buffering: true, kbps: 1700 }, 'medium', c)).toBeNull()
    expect(feed(b, 8000 + SNOOZE_MS, 4, { buffering: true, kbps: 1700 }, 'medium', c)).toEqual({ to: 'low', direction: 'down' })
  })
})

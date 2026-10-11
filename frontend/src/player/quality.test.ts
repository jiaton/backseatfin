import { expect, it } from 'vitest'

import { fitLevel, gbPerHour, loadQuality, MEDIA_SERVER_LEVELS, saveQuality } from './quality'

it('round-trips a valid choice and ignores junk or broken storage', () => {
  const m = new Map<string, string>()
  const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
  expect(loadQuality(store)).toBe('medium')
  saveQuality('low', store)
  expect(loadQuality(store)).toBe('low')
  m.set('backseatfin:quality', 'ultra')
  expect(loadQuality(store)).toBe('medium')
  const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
  expect(loadQuality(broken)).toBe('medium')
  expect(() => saveQuality('max', broken)).not.toThrow()
})

it("fits a level into the screen at the film's aspect ratio", () => {
  const medium = MEDIA_SERVER_LEVELS.Emby.medium // 1280×720
  expect(fitLevel(medium, { w: 1920, h: 1080 }, 16 / 9)).toEqual({ w: 1280, h: 720 })
  expect(fitLevel(medium, { w: 1920, h: 1080 }, 2.4)).toEqual({ w: 1280, h: 534 })
  expect(fitLevel(medium, { w: 1000, h: 500 }, 16 / 9)).toEqual({ w: 888, h: 500 })
  expect(fitLevel(MEDIA_SERVER_LEVELS.Emby.low, { w: 0, h: 0 }, 16 / 9)).toEqual({ w: 720, h: 406 })
  expect(gbPerHour(medium)).toBeCloseTo(1.41, 2)
})

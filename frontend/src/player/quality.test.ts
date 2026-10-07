import { expect, it } from 'vitest'

import { loadQuality, saveQuality } from './quality'

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

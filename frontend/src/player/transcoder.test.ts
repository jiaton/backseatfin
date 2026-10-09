import { describe, expect, it } from 'vitest'

import { loadTranscoder, saveTranscoder, prefersBackseatfin } from './transcoder'

describe('transcoder choice', () => {
  it('uses the BackseatFin server for HDR on auto, or when asked, or without WebCodecs', () => {
    expect(prefersBackseatfin('auto', false, 'webcodecs')).toBe(false)
    expect(prefersBackseatfin('auto', true, 'webcodecs')).toBe(true)
    expect(prefersBackseatfin('server', true, 'webcodecs')).toBe(false)
    expect(prefersBackseatfin('backseatfin', false, 'webcodecs')).toBe(true)
    expect(prefersBackseatfin('server', false, 'jsmpeg')).toBe(true)
  })

  it('is remembered per browser, auto by default', () => {
    const m = new Map<string, string>()
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
    expect(loadTranscoder(store)).toBe('auto')
    saveTranscoder('server', store)
    expect(loadTranscoder(store)).toBe('server')
    m.set('backseatfin:transcoder', 'nonsense')
    expect(loadTranscoder(store)).toBe('auto')
  })
})

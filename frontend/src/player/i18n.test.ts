import { expect, it } from 'vitest'

import { detectLang, LANGS, type StringKey, TABLE_KEYS, translator } from './i18n'

const store = (v: string | null) => ({ getItem: () => v })

it('prefers the saved choice, then the browser languages, then English', () => {
  expect(detectLang(store('zh'), ['en-US'])).toBe('zh')
  expect(detectLang(store(null), ['zh-CN', 'en'])).toBe('zh')
  expect(detectLang(store(null), ['zh-TW'])).toBe('zh')
  expect(detectLang(store(null), ['fr-FR', 'en-GB'])).toBe('en')
  expect(detectLang(store(null), ['fr-FR'])).toBe('en')
  expect(detectLang(store('klingon'), [])).toBe('en')
})

it('survives storage that throws', () => {
  const broken = { getItem: () => { throw new Error('denied') } }
  expect(detectLang(broken, ['zh-CN'])).toBe('zh')
})

it('fills in variables', () => {
  expect(translator('en')('loading', { time: '1:02' })).toBe('Loading… 1:02')
  expect(translator('zh')('backTo', { server: 'Emby' })).toBe('返回 Emby')
})

it('knows Spanish, Japanese and Korean too', () => {
  expect(detectLang(store(null), ['es-MX'])).toBe('es')
  expect(detectLang(store(null), ['ja-JP'])).toBe('ja')
  expect(detectLang(store(null), ['ko'])).toBe('ko')
})

it('has every string, with the same {variables}, in every language', () => {
  const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
  const en = translator('en')
  for (const lang of LANGS) {
    const t = translator(lang)
    for (const key of Object.keys(TABLE_KEYS) as StringKey[]) {
      // translator() leaves {vars} in place, so the raw strings can be compared
      expect(t(key), `${lang}.${key}`).toBeTruthy()
      expect(vars(t(key)), `${lang}.${key}`).toEqual(vars(en(key)))
    }
  }
})

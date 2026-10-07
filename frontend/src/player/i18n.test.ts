import { expect, it } from 'vitest'

import { detectLang, translator } from './i18n'

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

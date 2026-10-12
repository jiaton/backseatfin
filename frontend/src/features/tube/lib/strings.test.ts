import { expect, it } from 'vitest'

import { LANGS } from '@/player/i18n'

import { TUBE_KEYS, TUBE_TABLES, tubeTranslator } from './strings'

it('every language has every string, with the same placeholders', () => {
  for (const lang of LANGS) {
    for (const key of Object.keys(TUBE_KEYS) as (keyof typeof TUBE_KEYS)[]) {
      const en = TUBE_TABLES.en[key].match(/\{\w+\}/g)?.sort() ?? []
      expect(TUBE_TABLES[lang][key], `${lang}.${key}`).toBeTruthy()
      expect(TUBE_TABLES[lang][key].match(/\{\w+\}/g)?.sort() ?? [], `${lang}.${key}`).toEqual(en)
    }
  }
  expect(tubeTranslator('zh')('left', { time: '5:00' })).toBe('还剩 5:00')
})

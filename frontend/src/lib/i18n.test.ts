import { expect, it } from 'vitest'

import { type Key, TABLES, translate } from './i18n'

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

it('has every key in Chinese, non-empty and with the same variables', () => {
  const keys = Object.keys(TABLES.en) as Key[]
  expect(Object.keys(TABLES.zh).sort()).toEqual([...keys].sort())
  for (const key of keys) {
    expect(TABLES.zh[key], key).not.toBe('')
    expect(vars(TABLES.zh[key]), key).toEqual(vars(TABLES.en[key]))
  }
})

it('fills in variables and leaves unknown ones as written', () => {
  expect(translate('en')('added', { title: 'Car' })).toBe('Added “Car”')
  expect(translate('zh')('added', { title: 'Car' })).toBe('已添加「Car」')
  expect(translate('en')('newVideos', { count: 3 })).toBe('New videos: 3')
  expect(translate('en')('noReports')).toContain('{path}')
})

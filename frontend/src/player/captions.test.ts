import { expect, it } from 'vitest'

import { activeText, loadCaptionLang, saveCaptionLang } from './captions'

const cues = [
  { start: 1, end: 3, text: 'Good morning' },
  { start: 2.5, end: 5, text: 'How are you?' },
  { start: 6, end: 6, text: 'Fine' }, // no length from YouTube
  { start: 7, end: 9, text: 'One' },
  { start: 7.2, end: 9, text: 'Two' },
  { start: 7.4, end: 9, text: 'Three' },
]

it('shows the cues covering the moment, at most the newest two lines', () => {
  expect(activeText(cues, 0.5)).toBe('')
  expect(activeText(cues, 2)).toBe('Good morning')
  expect(activeText(cues, 2.8)).toBe('Good morning\nHow are you?')
  expect(activeText(cues, 6.8)).toBe('Fine') // kept up a moment
  expect(activeText(cues, 8)).toBe('Two\nThree')
})

it('remembers the caption language per browser', () => {
  const m = new Map<string, string>()
  const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
  expect(loadCaptionLang(store)).toBeNull()
  saveCaptionLang('zh-CN', store)
  expect(loadCaptionLang(store)).toBe('zh-CN')
  saveCaptionLang(null, store)
  expect(loadCaptionLang(store)).toBeNull()
})

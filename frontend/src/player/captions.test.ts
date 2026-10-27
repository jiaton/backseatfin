import { expect, it } from 'vitest'

import { activeText, loadCaptionLang, parseSubtitles, saveCaptionLang } from './captions'

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

it("reads a media server's WebVTT or SRT as plain cues", () => {
  const vtt = 'WEBVTT\n\n1\n00:00:01.500 --> 00:00:03.000 line:90%\n<i>Hola</i> &amp; adiós\n\n00:01:02.000 --> 00:01:04.25\n{\\an8}Arriba\\NAbajo\n'
  expect(parseSubtitles(vtt)).toEqual([
    { start: 1.5, end: 3, text: 'Hola & adiós' },
    { start: 62, end: 64.25, text: 'Arriba\nAbajo' },
  ])
  const srt = '2\r\n01:00:00,100 --> 01:00:02,000\r\n二\r\n\r\n1\r\n00:00:00,000 --> 00:00:01,000\r\n一\r\n第二行\r\n\r\n3\r\nbroken\r\n'
  expect(parseSubtitles(srt)).toEqual([
    { start: 0, end: 1, text: '一\n第二行' },
    { start: 3600.1, end: 3602, text: '二' },
  ])
})

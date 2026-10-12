import { expect, it } from 'vitest'

import { formatAgo, formatCount, formatDuration, imageUrl, playerHref } from './format'

it('formats lengths, counts and ages', () => {
  expect(formatDuration(75)).toBe('1:15')
  expect(formatDuration(3725)).toBe('1:02:05')
  expect(formatCount(23_429_704, 'en')).toBe('23.4M')
  const now = Date.parse('2026-10-12T12:00:00Z')
  expect(formatAgo('2026-10-09T12:00:00Z', 'en', now)).toBe('3 days ago')
  expect(formatAgo('2026-10-12T11:59:30Z', 'en', now)).toBe('this minute')
})

it('builds proxied image URLs and player links', () => {
  expect(imageUrl('https://i.ytimg.com/vi/x/hqdefault.jpg')).toBe('/api/tube/image?u=https%3A%2F%2Fi.ytimg.com%2Fvi%2Fx%2Fhqdefault.jpg')
  expect(playerHref('aqz-KE-bpKQ', 61.7, '/v/aqz-KE-bpKQ')).toBe('/play?yt=aqz-KE-bpKQ&t=61&back=%2Fv%2Faqz-KE-bpKQ')
})

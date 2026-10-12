import { expect, it } from 'vitest'

import { CLOSE_MESSAGE as INJECT_CLOSE, CREDENTIALS_KEY as INJECT_CREDENTIALS } from '@/inject/parse'

import { CLOSE_MESSAGE, CREDENTIALS_KEY, formatClock, readPlayerParams, readSessionCredentials, readTubeParams } from './params'

it('parses player params and confines back to Emby', () => {
  expect(readPlayerParams('?item=5&t=90&audio=2&sub=4&back=%2Fweb%2Findex.html%23!%2Fitem%3Fid%3D5')).toEqual({
    item: '5', t: 90, audio: 2, sub: 4, back: '/web/index.html#!/item?id=5', embed: false,
  })
  expect(readPlayerParams('?item=5&embed=1')?.embed).toBe(true)
  expect(readPlayerParams('?item=5&back=https%3A%2F%2Fevil.example')?.back).toBe('/web/')
  expect(readPlayerParams('?item=5&back=%2F%2Fevil.example%2Fweb%2F')?.back).toBe('/web/')
  // a server under a base path
  expect(readPlayerParams('?item=5&back=%2Fjf%2Fweb%2F%23%2Fdetails', '/jf')?.back).toBe('/jf/web/#/details')
  expect(readPlayerParams('?item=5&back=%2Fweb%2F', '/jf')?.back).toBe('/jf/web/')
  expect(readPlayerParams('?item=../x')).toBeNull()
  expect(readPlayerParams('?t=5')).toBeNull()
  expect(readPlayerParams('?item=5&t=-3&audio=x')).toMatchObject({ t: 0, audio: undefined })
})

it('reads credentials left by the inject script', () => {
  const store = new Map([[CREDENTIALS_KEY, JSON.stringify({ token: 'tok', userId: 'u1' })]])
  expect(readSessionCredentials({ getItem: (k) => store.get(k) ?? null })).toEqual({ token: 'tok', userId: 'u1' })
  expect(readSessionCredentials({ getItem: () => '{bad json' })).toBeNull()
  expect(readSessionCredentials({ getItem: () => null })).toBeNull()
})

it('formats clock times', () => {
  expect(formatClock(0)).toBe('0:00')
  expect(formatClock(75.9)).toBe('1:15')
  expect(formatClock(3 * 3600 + 62)).toBe('3:01:02')
})

it('shares the close-message protocol with inject.js', () => {
  expect(CLOSE_MESSAGE).toBe(INJECT_CLOSE)
  expect(CREDENTIALS_KEY).toBe(INJECT_CREDENTIALS)
})

it('reads a YouTube play link and keeps "back" inside this app', () => {
  expect(readTubeParams('?yt=aqz-KE-bpKQ&t=61&back=%2Fv%2Faqz-KE-bpKQ')).toEqual({ item: 'aqz-KE-bpKQ', t: 61, back: '/v/aqz-KE-bpKQ', embed: false })
  expect(readTubeParams('?yt=aqz-KE-bpKQ&back=//evil.example.com')?.back).toBe('/')
  expect(readTubeParams('?yt=aqz-KE-bpKQ&back=https://evil.example.com')?.back).toBe('/')
  expect(readTubeParams('?yt=../../x')).toBeNull()
})

import { expect, it } from 'vitest'

import type { EngineStats } from './engines/types'
import { translator } from './i18n'
import { loadingLines } from './loading'

const base: EngineStats & { connects: number } = { framesDrawn: 0, connects: 1 } as EngineStats & { connects: number }
const input = { retrying: false, waited: 2.4, server: 'YouTube', needKbps: 3000, quality: 'Standard · 1280×720 · 3.0 Mbps', at: '1:15' }

it('says what the wait is about, then the numbers behind it', () => {
  const t = translator('en')
  expect(loadingLines(t, { ...input, stats: base }).stage).toBe('YouTube is preparing the video… 2 s')
  const receiving = loadingLines(t, { ...input, stats: { ...base, bytesReceived: 3 * 1048576, receiveKbps: 4200, bufferAheadS: 0.3 } })
  expect(receiving.stage).toBe('Receiving the video… 2 s')
  expect(receiving.lines).toEqual([
    'Speed  4.2 Mbps · this quality needs ≈ 3.0 Mbps',
    'Received  3.0 MB · 0.3 s buffered',
    'Quality  Standard · 1280×720 · 3.0 Mbps · from 1:15',
  ])
  expect(loadingLines(t, { ...input, stats: { ...base, bytesReceived: 1, framesDrawn: 40 } }).stage).toBe('The network is slow, buffering… 2 s')
  expect(loadingLines(t, { ...input, retrying: true, stats: base }).stage).toBe('Connection lost, reconnecting… 2 s')
})

it('adds the segment for HLS and the connection count after a reconnect, in the viewer\'s language', () => {
  const { lines } = loadingLines(translator('zh'), { ...input, stats: { ...base, connects: 3, segment: 12, segmentWaitMs: 1300 } })
  expect(lines).toContain('分片  #12 · 服务器准备用了 1.3 秒')
  expect(lines.at(-1)).toBe('连接次数  3')
})

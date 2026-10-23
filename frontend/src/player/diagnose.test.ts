import { expect, it } from 'vitest'

import { diagnose, type PlayerState } from './diagnose'

const playing = (stats: PlayerState['stats'] = { framesDrawn: 100 }): PlayerState => ({ paused: false, retrying: false, started: true, stats })

it('says what the player is doing when nothing is wrong', () => {
  expect(diagnose(playing({ framesDrawn: 1, bufferAheadS: 8, realtime: 1.6, receiveKbps: 2600, streamKbps: 1600 })).key).toBe('statsOk')
  expect(diagnose({ ...playing(), paused: true, stats: { framesDrawn: 1, bufferAheadS: 7.94 } })).toEqual({ key: 'statsPaused', vars: { buffer: '7.9' } })
  expect(diagnose({ ...playing(), started: false }).key).toBe('statsStarting')
  expect(diagnose({ ...playing(), retrying: true }).key).toBe('statsOutage')
})

it('blames the decoder when the picture falls behind the clock', () => {
  expect(diagnose(playing({ framesDrawn: 1, videoBehindMs: 450, bufferAheadS: 8 }))).toEqual({ key: 'statsSlowDecoder', vars: { ms: '450' } })
})

it('blames the network when data comes in slower than it plays and the buffer runs low', () => {
  expect(diagnose(playing({ framesDrawn: 1, bufferAheadS: 0.8, realtime: 0.6, receiveKbps: 980, streamKbps: 1620 }))).toEqual({
    key: 'statsSlowData',
    vars: { rate: '1.0', need: '1.6' },
  })
  // plenty buffered: not (yet) a problem
  expect(diagnose(playing({ framesDrawn: 1, bufferAheadS: 6, realtime: 0.6, receiveKbps: 980, streamKbps: 1620 })).key).toBe('statsOk')
})

it('blames the server when HLS segments take long to start arriving', () => {
  expect(diagnose(playing({ framesDrawn: 1, bufferAheadS: 1, segmentWaitMs: 2600, realtime: 0.7, streamKbps: 1600 }))).toEqual({
    key: 'statsSlowServer',
    vars: { ms: '2600' },
  })
})

it('an empty buffer is the network, not the decoder, even with the picture behind', () => {
  // The car on 2026-10-23: 0.49× real time, nothing buffered, picture 18.5 s behind.
  expect(diagnose(playing({ framesDrawn: 1, videoBehindMs: 18516, bufferAheadS: 0, realtime: 0.49, receiveKbps: 1740, streamKbps: 3530 }))).toEqual({
    key: 'statsSlowData',
    vars: { rate: '1.7', need: '3.5' },
  })
})

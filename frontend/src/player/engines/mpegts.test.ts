import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

import { avcCodecString } from './annexb'
import { type AudioSample, TsDemuxer, type VideoSample } from './mpegts'

// 0.5 s of 64x64 H.264 High (no B-frames) + AAC-LC 48 kHz stereo, made by the same
// ffmpeg flags the server uses for format=h264ts.
const fixture = new Uint8Array(readFileSync(join(__dirname, '__fixtures__/tiny.mpegts')))
// 0.5 s of 64x64 H.264 High with 3 B-frames (decode order ≠ display order), like a
// media server's HLS transcode.
const bframes = new Uint8Array(readFileSync(join(__dirname, '__fixtures__/bframes.mpegts')))

function demux(chunkSize: number, bytes = fixture) {
  const video: VideoSample[] = []
  const audio: AudioSample[] = []
  const d = new TsDemuxer((v) => video.push(v), (a) => audio.push(a))
  for (let i = 0; i < bytes.length; i += chunkSize) d.push(bytes.subarray(i, i + chunkSize))
  d.flush()
  return { video, audio }
}

it('demuxes every video frame, keyframe first, with 24 fps timestamps', () => {
  const { video } = demux(fixture.length)
  expect(video).toHaveLength(12)
  expect(video[0].key).toBe(true)
  expect(video.slice(1).every((v) => !v.key)).toBe(true)
  const steps = video.slice(1).map((v, i) => v.pts - video[i].pts)
  steps.forEach((s) => expect(s).toBeCloseTo(1 / 24, 3))
  // Annex-B access units
  expect(Array.from(video[0].data.subarray(0, 4))).toEqual([0, 0, 0, 1])
})

it('demuxes AAC into raw frames with a valid AudioSpecificConfig', () => {
  const { audio } = demux(fixture.length)
  expect(audio.length).toBe(25)
  const { config } = audio[0]
  expect(config.sampleRate).toBe(48000)
  expect(config.channels).toBe(2)
  // AAC-LC (2), 48 kHz (index 3), stereo (2) → 0x11 0x90
  expect(Array.from(config.asc)).toEqual([0x11, 0x90])
  // raw frames: the ADTS sync word is gone
  expect(audio[0].data[0] === 0xff && (audio[0].data[1] & 0xf0) === 0xf0).toBe(false)
  const steps = audio.slice(1).map((a, i) => a.pts - audio[i].pts)
  steps.forEach((s) => expect(s).toBeCloseTo(1024 / 48000, 3))
})

it('gives identical results however the network chunks the stream', () => {
  const whole = demux(fixture.length)
  for (const size of [1, 187, 188, 1000]) {
    const chunked = demux(size)
    expect(chunked.video.map((v) => [v.pts, v.data.length])).toEqual(whole.video.map((v) => [v.pts, v.data.length]))
    expect(chunked.audio.length).toBe(whole.audio.length)
  }
})

it('without B-frames, decode time is the presentation time', () => {
  const { video } = demux(fixture.length)
  expect(video.every((v) => v.dts === v.pts)).toBe(true)
})

it('with B-frames, reads decode times: increasing, never after the presentation time', () => {
  const { video } = demux(bframes.length, bframes)
  expect(video).toHaveLength(12)
  expect(video.some((v) => v.dts !== v.pts)).toBe(true)
  video.forEach((v) => expect(v.dts).toBeLessThanOrEqual(v.pts + 1e-9))
  video.slice(1).forEach((v, i) => expect(v.dts).toBeGreaterThan(video[i].dts))
  // display order differs from decode order
  const pts = video.map((v) => v.pts)
  expect(pts).not.toEqual([...pts].sort((a, b) => a - b))
})

it('reads the codec string from the keyframe SPS', () => {
  const { video } = demux(bframes.length, bframes)
  expect(avcCodecString(video[0].data)).toMatch(/^avc1\.64[0-9a-f]{4}$/) // High profile
  expect(avcCodecString(video[1].data)).toBeNull()
})

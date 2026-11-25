import { expect, it } from 'vitest'

import type { AudioSample, VideoSample } from './mpegts'
import { spliceSamples } from './splice'

const config = { sampleRate: 48000, channels: 2, asc: new Uint8Array([0x11, 0x90]) }
const FRAME = 1024 / 48000

function harness(audioCut: number | null, videoCut: number, floor = Number.NEGATIVE_INFINITY) {
  const video: VideoSample[] = []
  const audio: AudioSample[] = []
  const cuts: number[] = []
  const { video: v, audio: a } = spliceSamples(audioCut, videoCut, {
    video: (v) => video.push(v),
    audio: (a) => audio.push(a),
    cutVideo: (pts) => cuts.push(pts),
    videoFloor: () => floor,
  })
  return { video, audio, cuts, v, a }
}
const frame = (pts: number, key = false): VideoSample => ({ pts, dts: pts, key, data: new Uint8Array(1) })
const sound = (pts: number): AudioSample => ({ pts, data: new Uint8Array(1), config })
const close = (xs: number[], want: number[]) => {
  expect(xs).toHaveLength(want.length)
  xs.forEach((x, i) => expect(x).toBeCloseTo(want[i], 6))
}

it('copied video: the new sound goes on exactly where the received sound ends, the picture switches at its keyframe', () => {
  // The new stream (asked from film time t) has its picture from the keyframe 3 s
  // before t, its sound from t; its own timestamps start at 100.
  const h = harness(20, 20.2, 12)
  for (let i = 0; i < 75; i++) h.v(frame(100 + i / 25, i === 0)) // 3 s of picture before any sound
  expect(h.video).toHaveLength(0) // held until the sound places them
  h.a(sound(103))
  h.a(sound(103 + FRAME))
  close(h.audio.map((a) => a.pts), [20, 20 + FRAME])
  expect(h.cuts).toEqual([17]) // the received picture from 17 s on is replaced
  expect(h.video[0]).toMatchObject({ pts: 17, key: true })
  expect(h.video).toHaveLength(75)
  h.v(frame(103.04))
  expect(h.video.at(-1)!.pts).toBeCloseTo(20.04, 6)
})

it('the picture can only switch after what the decoder already has: earlier keyframes are skipped', () => {
  const h = harness(20, 20, 18) // decoded up to 18 s already
  h.v(frame(100, true)) // would land on 17
  h.v(frame(100.5))
  h.a(sound(103))
  expect(h.video).toHaveLength(0)
  h.v(frame(102, true)) // lands on 19
  expect(h.cuts).toEqual([19])
  expect(h.video.map((v) => v.pts)).toEqual([19])
  expect(h.audio.map((a) => a.pts)).toEqual([20])
})

it('a re-encoded stream (picture and sound start together) lines up the same way', () => {
  const h = harness(20, 20.3, 15)
  h.v(frame(50, true))
  h.a(sound(50))
  expect(h.cuts).toEqual([20])
  expect(h.video[0].pts).toBe(20)
  expect(h.audio[0].pts).toBe(20)
})

it('no sound received: the first keyframe replaces the newest frame, sound before it is dropped', () => {
  const h = harness(null, 20)
  h.a(sound(99.5)) // before the keyframe: held
  h.v(frame(100, true))
  h.a(sound(100.1))
  expect(h.cuts).toEqual([20])
  expect(h.video[0].pts).toBe(20)
  close(h.audio.map((a) => a.pts), [20.1])
})

it('a new stream with no sound is placed by its picture after a bounded wait', () => {
  const h = harness(20, 20.2)
  for (let i = 0; i <= 10 * 25 + 1; i++) h.v(frame(100 + i / 25, i === 0))
  close(h.cuts, [20.2])
  expect(h.video[0].pts).toBeCloseTo(20.2, 6)
})

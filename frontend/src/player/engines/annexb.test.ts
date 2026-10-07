import { describe, expect, it } from 'vitest'

import { AnnexBSplitter, isKeyframe } from './annexb'

const AUD = [0, 0, 0, 1, 0x09, 0xf0]
const SPS = [0, 0, 0, 1, 0x67, 1, 2]
const IDR = [0, 0, 1, 0x65, 3, 4, 5]
const P = [0, 0, 1, 0x41, 6, 7]
const bytes = (...parts: number[][]) => new Uint8Array(parts.flat())

describe('AnnexBSplitter', () => {
  it('emits one access unit per AUD, holding back the open one', () => {
    const s = new AnnexBSplitter()
    const units = s.push(bytes(AUD, SPS, IDR, AUD, P, AUD, P))
    expect(units.map((u) => Array.from(u))).toEqual([[...AUD, ...SPS, ...IDR], [...AUD, ...P]])
    expect(s.push(bytes(AUD)).map((u) => Array.from(u))).toEqual([[...AUD, ...P]])
  })

  it('handles start codes split across network chunks', () => {
    const s = new AnnexBSplitter()
    const all = bytes(AUD, IDR, AUD, P, AUD)
    const out: number[][] = []
    for (let i = 0; i < all.length; i += 3) out.push(...s.push(all.subarray(i, i + 3)).map((u) => Array.from(u)))
    expect(out).toEqual([[...AUD, ...IDR], [...AUD, ...P]])
  })
})

it('detects keyframes by their IDR slice', () => {
  expect(isKeyframe(bytes(AUD, SPS, IDR))).toBe(true)
  expect(isKeyframe(bytes(AUD, P))).toBe(false)
})

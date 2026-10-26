import { describe, expect, it } from 'vitest'

import { chartTop, createHistory, GRAPH_SECONDS } from './net-graph'

describe('network graph', () => {
  it('keeps two minutes, and a link measurement only on the second it was made', () => {
    const h = createHistory()
    for (let i = 0; i < GRAPH_SECONDS + 10; i++) h.add({ framesDrawn: 0, receiveKbps: i, networkKbps: 5000, networkSamples: Math.floor(i / 4) }, false)
    expect(h.points).toHaveLength(GRAPH_SECONDS)
    expect(h.points.at(-1)!.receiveKbps).toBe(GRAPH_SECONDS + 9)
    expect(h.points.filter((p) => p.networkKbps != null)).toHaveLength(GRAPH_SECONDS / 4)
  })

  it('the need carries over the seconds nothing arrived', () => {
    const h = createHistory()
    h.add({ framesDrawn: 0, receiveKbps: 3000, streamKbps: 2500 }, false)
    h.add({ framesDrawn: 0, receiveKbps: 0 }, false)
    expect(h.points.at(-1)!.streamKbps).toBe(2500)
    h.clear()
    h.add({ framesDrawn: 0, receiveKbps: 0 }, false)
    expect(h.points.at(-1)!.streamKbps).toBeNull()
  })

  it('scales to the need, clipping a burst far above it', () => {
    const p = (receiveKbps: number) => ({ receiveKbps, networkKbps: null, streamKbps: 2000, bufferS: 20, waiting: false })
    expect(chartTop([p(1500)])).toBeCloseTo(3000 * 1.1) // the need × 1.5
    expect(chartTop([p(40_000)])).toBeCloseTo(8000 * 1.1) // clipped at 4× the need
  })
})

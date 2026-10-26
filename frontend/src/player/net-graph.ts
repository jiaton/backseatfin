import type { EngineStats } from './engines/types'

/** One point a second, two minutes shown: the span the quality advice looks at. */
export const GRAPH_SECONDS = 120
/** The buffer gauge goes this far (the inputs keep 15–20 s, 30 s while probing). */
const GAUGE_MAX_S = 30
/** The flow-control marks on the gauge (BUFFER_LOW_S / BUFFER_HIGH_S). */
const GAUGE_MARKS = [15, 20]
export const WIDTH = 420
const GAUGE_H = 18
const LEGEND_H = 22
const CHART_H = 72
export const HEIGHT = GAUGE_H + LEGEND_H + CHART_H
const FONT = 'ui-monospace, Menlo, Consolas, monospace'

export interface GraphPoint {
  /** What arrived that second, and the input's latest measurement of the link. */
  receiveKbps: number
  networkKbps: number | null
  /** What the stream needs (its bitrate). */
  streamKbps: number | null
  bufferS: number
  waiting: boolean
}

/** The last GRAPH_SECONDS of points, oldest first. */
export function createHistory() {
  let points: GraphPoint[] = []
  let lastSample: number | undefined
  return {
    add(s: EngineStats, waiting: boolean) {
      const fresh = s.networkSamples != null && s.networkSamples !== lastSample
      lastSample = s.networkSamples
      points.push({
        receiveKbps: s.receiveKbps ?? 0,
        networkKbps: fresh ? (s.networkKbps ?? null) : null,
        // Not measured while nothing arrives (the server held): the last one still holds.
        streamKbps: s.streamKbps ?? points.at(-1)?.streamKbps ?? null,
        bufferS: s.bufferAheadS ?? 0,
        waiting,
      })
      if (points.length > GRAPH_SECONDS) points = points.slice(-GRAPH_SECONDS)
    },
    clear() {
      points = []
    },
    get points(): readonly GraphPoint[] {
      return points
    },
  }
}

/** The y-axis top: room for the needed rate, what arrived and the link (an outlier past
 * 4× the need is clipped, so a 40 Mbps burst doesn't flatten a 2 Mbps stream). */
export function chartTop(points: readonly GraphPoint[]): number {
  const need = Math.max(0, ...points.map((p) => p.streamKbps ?? 0))
  const seen = Math.max(0, ...points.map((p) => Math.max(p.receiveKbps, p.networkKbps ?? 0)))
  const top = need ? Math.min(seen, need * 4) : seen
  return Math.max(top, need * 1.5, 1000) * 1.1
}

/**
 * The stats panel's picture of the network: a gauge of the buffer (marks at the
 * flow-control levels; red when nearly empty), a legend with the latest values, and two
 * minutes of what arrived (line), the link measurements (squares), the stream's need
 * (dashed) and waits for data (red columns). A canvas redrawn only while the panel is
 * open; solid backgrounds, since the picture shows through the panel.
 */
export function createNetGraph() {
  const canvas = document.createElement('canvas')
  canvas.className = 'cm-graph'
  canvas.setAttribute('aria-hidden', 'true')
  let colors: Record<'fg' | 'muted' | 'line' | 'panel' | 'accent' | 'bad', string> | null = null

  return {
    el: canvas,
    draw(points: readonly GraphPoint[]) {
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== WIDTH * dpr) {
        canvas.width = WIDTH * dpr
        canvas.height = HEIGHT * dpr
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      if (!colors) {
        const css = getComputedStyle(canvas)
        const v = (name: string) => css.getPropertyValue(name).trim()
        colors = { fg: v('--cm-fg'), muted: v('--cm-muted'), line: v('--cm-line'), panel: v('--cm-panel'), accent: v('--cm-accent'), bad: v('--cm-bad') }
      }
      const c = colors
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, WIDTH, HEIGHT)
      ctx.font = `12px ${FONT}`
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      const last = points.at(-1)
      const mbps = (kbps: number) => (kbps / 1000).toFixed(1)

      // Buffer gauge.
      const buffer = last?.bufferS ?? 0
      ctx.fillStyle = c.panel
      ctx.fillRect(0, 0, WIDTH, GAUGE_H)
      ctx.fillStyle = buffer < 5 ? c.bad : c.accent
      ctx.fillRect(0, 0, (Math.min(buffer, GAUGE_MAX_S) / GAUGE_MAX_S) * WIDTH, GAUGE_H)
      ctx.fillStyle = c.fg
      for (const m of GAUGE_MARKS) ctx.fillRect((m / GAUGE_MAX_S) * WIDTH - 0.5, 0, 1, GAUGE_H)
      ctx.fillText(`buffer ${buffer.toFixed(1)} s`, 6, GAUGE_H / 2 + 1)
      ctx.textAlign = 'right'
      ctx.fillText(`${GAUGE_MAX_S} s`, WIDTH - 6, GAUGE_H / 2 + 1)
      ctx.textAlign = 'left'

      // Legend, each name in its series' color.
      const ly = GAUGE_H + LEGEND_H / 2 + 1
      let lx = 0
      const word = (text: string, color: string) => {
        ctx.fillStyle = color
        ctx.fillText(text, lx, ly)
        lx += ctx.measureText(text).width
      }
      const link = [...points].reverse().find((p) => p.networkKbps != null)?.networkKbps
      word(`— in ${mbps(last?.receiveKbps ?? 0)}`, c.accent)
      word(`  ■ link ${link != null ? mbps(link) : '–'}`, c.fg)
      word(`  ┄ needs ${last?.streamKbps ? mbps(last.streamKbps) : '–'}`, c.bad)
      word(' Mbps', c.muted)
      ctx.textAlign = 'right'
      ctx.fillStyle = c.muted
      ctx.fillText(`${GRAPH_SECONDS / 60} min`, WIDTH, ly)
      ctx.textAlign = 'left'

      // Speed chart.
      const y0 = GAUGE_H + LEGEND_H
      ctx.fillStyle = c.panel
      ctx.fillRect(0, y0, WIDTH, CHART_H)
      ctx.fillStyle = c.line
      ctx.fillRect(0, y0 + CHART_H / 2, WIDTH, 1)
      if (!points.length) return
      const top = chartTop(points)
      const step = WIDTH / GRAPH_SECONDS
      const x = (i: number) => WIDTH - (points.length - i) * step
      const y = (kbps: number) => y0 + CHART_H - (Math.min(kbps, top) / top) * (CHART_H - 2)
      ctx.fillStyle = c.bad
      ctx.globalAlpha = 0.4
      points.forEach((p, i) => p.waiting && ctx.fillRect(x(i), y0, step, CHART_H))
      ctx.globalAlpha = 1
      ctx.strokeStyle = c.bad
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      points.forEach((p, i) => p.streamKbps && (ctx.moveTo(x(i), y(p.streamKbps)), ctx.lineTo(x(i) + step, y(p.streamKbps))))
      ctx.stroke()
      ctx.setLineDash([])
      ctx.strokeStyle = c.accent
      ctx.lineWidth = 2
      ctx.beginPath()
      points.forEach((p, i) => (i ? ctx.lineTo(x(i) + step / 2, y(p.receiveKbps)) : ctx.moveTo(x(i) + step / 2, y(p.receiveKbps))))
      ctx.stroke()
      ctx.fillStyle = c.fg
      points.forEach((p, i) => p.networkKbps != null && ctx.fillRect(x(i) + step / 2 - 2.5, y(p.networkKbps) - 2.5, 5, 5))
      // Scale: the top and the middle line, in Mbps.
      ctx.fillStyle = c.muted
      ctx.font = `11px ${FONT}`
      ctx.textBaseline = 'top'
      ctx.fillText(mbps(top), 4, y0 + 2)
      ctx.textBaseline = 'bottom'
      ctx.fillText(mbps(top / 2), 4, y0 + CHART_H / 2 - 1)
    },
  }
}

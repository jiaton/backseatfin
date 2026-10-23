import type { Level, Quality } from './quality'
import { QUALITY_VALUES } from './quality'

/** A button the player offers (never switches by itself): a lower quality when the
 * network can't keep up, and back up once it clearly can again. */
export interface QualityAdvice {
  to: Quality
  direction: 'down' | 'up'
}

export interface AdvisorSample {
  /** performance.now(), ms. */
  at: number
  /** The clock is stopped waiting for data. */
  buffering: boolean
  /** The input's latest measurement of the network while fetching, and how many it has
   * made (a new one = the count changed). */
  networkKbps?: number
  networkSamples?: number
}

/** Two stops to wait for data within this long, or one this long = can't keep up. */
const REBUFFER_WINDOW_MS = 90_000
const LONG_REBUFFER_MS = 5000
/** A lower level is picked to need at most this share of the measured rate. */
const DOWN_HEADROOM = 0.8
/** Up again only with this much more than the higher level needs… */
const UP_HEADROOM = 1.5
/** …in this many fresh measurements within… */
const UP_SAMPLES = 3
const UP_WINDOW_MS = 60_000
/** …and no stop to wait for data for this long. */
const UP_CALM_MS = 120_000
/** Advice the viewer let pass isn't repeated for this long. */
export const SNOOZE_MS = 180_000

export function createQualityAdvisor(levels: () => Record<Quality, Level>) {
  let stops: number[] = [] // when each wait for data began
  let bufferingSince: number | null = null
  let rates: { at: number; kbps: number }[] = [] // the network's, recent
  let lastSample = 0
  /** The level the viewer had before taking "lower" advice: "up" goes no higher. */
  let ceiling: Quality | null = null
  const snoozed: Record<QualityAdvice['direction'], number> = { down: 0, up: 0 }

  const index = (q: Quality) => QUALITY_VALUES.indexOf(q)

  return {
    /** Feed one sample (every couple of seconds); returns advice to show, if any. */
    sample(s: AdvisorSample, current: Quality): QualityAdvice | null {
      if (s.buffering && bufferingSince == null) {
        bufferingSince = s.at
        stops.push(s.at)
      } else if (!s.buffering) bufferingSince = null
      stops = stops.filter((t) => s.at - t < Math.max(REBUFFER_WINDOW_MS, UP_CALM_MS))
      if (s.networkSamples && s.networkSamples !== lastSample && s.networkKbps) {
        lastSample = s.networkSamples
        rates.push({ at: s.at, kbps: s.networkKbps })
      }
      rates = rates.filter((r) => s.at - r.at < UP_WINDOW_MS)

      const struggling =
        stops.filter((t) => s.at - t < REBUFFER_WINDOW_MS).length >= 2 ||
        (bufferingSince != null && s.at - bufferingSince >= LONG_REBUFFER_MS)
      if (struggling && index(current) > 0 && s.at >= snoozed.down) {
        const lower = QUALITY_VALUES.slice(0, index(current))
        // What the network gives now: the median of the recent measurements.
        const sorted = rates.map((r) => r.kbps).sort((a, b) => a - b)
        const network = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
        const fits = lower.filter((q) => levels()[q].kbps <= network * DOWN_HEADROOM)
        return { to: fits.at(-1) ?? lower[0], direction: 'down' }
      }
      if (ceiling && index(current) < index(ceiling) && s.at >= snoozed.up && !stops.some((t) => s.at - t < UP_CALM_MS)) {
        const next = QUALITY_VALUES[index(current) + 1]
        const good = rates.filter((r) => r.kbps >= levels()[next].kbps * UP_HEADROOM)
        if (good.length >= UP_SAMPLES) return { to: next, direction: 'up' }
      }
      return null
    },
    /** The viewer took the advice (the stream restarts at the new level). */
    taken(advice: QualityAdvice, from: Quality) {
      if (advice.direction === 'down') ceiling ??= from
      else if (ceiling && index(advice.to) >= index(ceiling)) ceiling = null
      stops = []
      rates = []
      bufferingSince = null
    },
    /** The viewer picked a quality themselves: theirs to keep, nothing to go back up to. */
    reset() {
      ceiling = null
      stops = []
      rates = []
      bufferingSince = null
    },
    /** Shown and let pass: not again for a while. */
    snooze(advice: QualityAdvice, at: number) {
      snoozed[advice.direction] = at + SNOOZE_MS
    },
  }
}

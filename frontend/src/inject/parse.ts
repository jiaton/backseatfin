/**
 * Pure helpers for the Emby hand-off script (no DOM, no imports — this file is bundled
 * into the fixed-name inject.js that Emby's page loads).
 */

/** postMessage type the embedded player sends to ask inject.js to close its layer. */
export const CLOSE_MESSAGE = 'backseatfin:close'

export interface Handoff {
  item: string
  t: number
  audio?: number
  sub?: number
}

// Emby's playback URLs: direct play (/Videos/{id}/stream[.ext]), HLS transcode
// (/Videos/{id}/master.m3u8, main.m3u8), live (/Videos/{id}/live.m3u8).
const PLAYBACK_PATH = /\/videos\/([A-Za-z0-9]+)\/(?:stream|original|master|main|live)(?:\.[a-z0-9]+)?$/i

function intParam(params: URLSearchParams, ...names: string[]): number | undefined {
  for (const name of names) {
    const v = params.get(name)
    if (v != null && /^\d+$/.test(v)) return Number(v)
  }
  return undefined
}

/** Recognizes an Emby video playback URL and extracts what the car player needs. */
export function parsePlaybackUrl(raw: string, base: string): Handoff | null {
  let url: URL
  try {
    url = new URL(raw, base)
  } catch {
    return null
  }
  const m = PLAYBACK_PATH.exec(url.pathname)
  if (!m) return null
  const params = url.searchParams
  // Direct play appends #t=<seconds>; transcodes carry StartTimeTicks (1e7 per second).
  const hashT = /(?:^#|&)t=([\d.]+)/.exec(url.hash)
  const ticks = intParam(params, 'StartTimeTicks', 'startTimeTicks')
  const t = hashT ? Number(hashT[1]) : ticks ? ticks / 1e7 : 0
  return {
    item: m[1],
    t: Math.max(0, Math.floor(t)),
    audio: intParam(params, 'AudioStreamIndex', 'audioStreamIndex'),
    // Emby uses -1 for "no subtitles"; intParam only accepts non-negative integers.
    sub: intParam(params, 'SubtitleStreamIndex', 'subtitleStreamIndex'),
  }
}

/** Emby routes that are the player itself — never a sensible "back" target. */
export function isPlayerRoute(href: string): boolean {
  return /videoosd|nowplaying/i.test(href)
}

export function playerUrl(h: Handoff, back: string, embed = false): string {
  const q = new URLSearchParams({ item: h.item, t: String(h.t), back })
  if (embed) q.set('embed', '1')
  if (h.audio != null) q.set('audio', String(h.audio))
  if (h.sub != null) q.set('sub', String(h.sub))
  return `/car/play?${q}`
}

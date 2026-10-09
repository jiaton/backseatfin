/**
 * Pure helpers for the hand-off script (no DOM, no imports — this file is bundled into
 * the fixed-name inject.js that Emby's or Jellyfin's page loads). Both web apps share
 * their ancestry: the same player element, URL shapes and query parameters.
 */

/** postMessage type the embedded player sends to ask inject.js to close its layer. */
export const CLOSE_MESSAGE = 'backseatfin:close'
/** sessionStorage key under which inject.js leaves the viewer's session for the player. */
export const CREDENTIALS_KEY = 'backseatfin:session'
/** localStorage key: '1' = this browser is in car mode (see isActive). */
export const CAR_MODE_KEY = 'backseatfin:car'

/** Whether to take over playback here. The script tag's data-mode: none = always (the
 * page was served on a car-only hostname); 'opt-in' = only in browsers switched to car
 * mode, so phones and computers on the same address keep the server's own player. */
export function isActive(mode: string | undefined, carMode: string | null): boolean {
  return mode !== 'opt-in' || carMode === '1'
}

export interface Handoff {
  item: string
  t: number
  audio?: number
  sub?: number
  /** The server's id for this playback, when the URL has one: the same id again is its
   * player retrying, not a new Play. */
  session?: string
}

// Playback URLs: direct play (/Videos/{id}/stream[.ext]), HLS transcode
// (/Videos/{id}/master.m3u8, main.m3u8), live (/Videos/{id}/live.m3u8).
// Item ids: Emby's are numbers, Jellyfin's 32 hex digits — sometimes written as a
// dashed GUID (its own HLS player does that).
const PLAYBACK_PATH = /\/videos\/([A-Za-z0-9-]+)\/(?:stream|original|master|main|live)(?:\.[a-z0-9]+)?$/i

function intParam(params: URLSearchParams, ...names: string[]): number | undefined {
  for (const name of names) {
    const v = params.get(name)
    if (v != null && /^\d+$/.test(v)) return Number(v)
  }
  return undefined
}

/** Recognizes a video playback URL and extracts what the car player needs. */
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
    // -1 means "no subtitles"; intParam only accepts non-negative integers.
    sub: intParam(params, 'SubtitleStreamIndex', 'subtitleStreamIndex'),
    session: params.get('PlaySessionId') ?? params.get('playSessionId') ?? undefined,
  }
}

/** Routes that are the server's own player — never a sensible "back" target. Emby:
 * #!/videoosd/…, #!/nowplaying; Jellyfin: #/video, #/queue. */
export function isPlayerRoute(href: string): boolean {
  return /videoosd|nowplaying|#!?\/(?:video|queue)(?:[?/]|$)/i.test(href)
}

/** `playerPath`: where the player page is, next to inject.js (/car/play on our car
 * host, <jellyfin>/BackseatFin/play from the plugin). */
export function playerUrl(h: Handoff, back: string, embed = false, playerPath = '/car/play'): string {
  const q = new URLSearchParams({ item: h.item, t: String(h.t), back })
  if (embed) q.set('embed', '1')
  if (h.audio != null) q.set('audio', String(h.audio))
  if (h.sub != null) q.set('sub', String(h.sub))
  return `${playerPath}?${q}`
}

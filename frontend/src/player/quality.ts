/** Stream quality: four levels the viewer picks from. What each one sends depends on
 * who transcodes (each source says, see `PlaybackSource.levels`). */
export const QUALITY_VALUES = ['low', 'medium', 'high', 'max'] as const
export type Quality = (typeof QUALITY_VALUES)[number]

/** A level: the largest picture it sends (fitted into this box at the film's aspect
 * ratio, and never larger than the screen) and its video bitrate. */
export interface Level {
  width: number
  height: number
  kbps: number
}

const level = (width: number, height: number, kbps: number): Level => ({ width, height, kbps })

/** Our server: it scales to the box and encodes at the bitrate it's given (mirrors the
 * backend's `stream.ports.QUALITY_PRESETS` / `H264_QUALITY_PRESETS` heights and rates;
 * the WS query param is not part of the OpenAPI schema, so this is a hand-kept mirror).
 * JS-decoded MPEG-1 can't do what hardware H.264 does. */
export const SERVER_LEVELS: Record<'webcodecs' | 'jsmpeg', Record<Quality, Level>> = {
  webcodecs: { low: level(854, 480, 800), medium: level(1280, 720, 1500), high: level(1920, 1080, 3000), max: level(1920, 1080, 6000) },
  jsmpeg: { low: level(854, 480, 1000), medium: level(1280, 720, 2000), high: level(1280, 720, 3500), max: level(1920, 1080, 5000) },
}

/**
 * Emby and Jellyfin choose the picture *width* from the bitrate they're asked for, and
 * MaxWidth/MaxHeight only lower it further (an explicit Width is ignored). So each level
 * asks for at least the bitrate that buys its width. Measured from the master playlists
 * (2026-10-10):
 * - Emby 4.8: under 0.6 Mbps 426 wide, under 1 Mbps 640, under 3 Mbps 720, under
 *   4 Mbps 1280, from 4 Mbps 1920 (the same for 16:9 and 2.39:1 films).
 * - Jellyfin 12: under 1.5 Mbps 960, under 2.5 Mbps 1280, from 2.5 Mbps 1920.
 */
export const MEDIA_SERVER_LEVELS: Record<'Emby' | 'Jellyfin', Record<Quality, Level>> = {
  Emby: { low: level(720, 480, 1000), medium: level(1280, 720, 3000), high: level(1920, 1080, 4000), max: level(1920, 1080, 6000) },
  Jellyfin: { low: level(854, 480, 800), medium: level(1280, 720, 1500), high: level(1920, 1080, 3000), max: level(1920, 1080, 6000) },
}

/** The picture a level sends into a display box (0 = unknown) at an aspect ratio. */
export function fitLevel(l: Level, box: { w: number; h: number }, aspect: number): { w: number; h: number } {
  const maxW = Math.min(l.width, box.w || l.width)
  const maxH = Math.min(l.height, box.h || l.height)
  let h = maxH
  let w = h * aspect
  if (w > maxW) {
    w = maxW
    h = w / aspect
  }
  const even = (n: number) => Math.round(n / 2) * 2
  return { w: even(w), h: even(h) }
}

/** Data a level uses per hour, in GB (video + 128 kbit/s audio). */
export const gbPerHour = (l: Level) => ((l.kbps + 128) * 3600) / 8 / 1e6

const KEY = 'backseatfin:quality'
// 720p by default: in the car responsiveness beats picture quality, and half the
// bitrate of 1080p means fewer stalls on 4G. 1080p is one tap away and remembered.
const DEFAULT: Quality = 'medium'

const isQuality = (v: unknown): v is Quality => QUALITY_VALUES.some((q) => q === v)

/** Per-browser convenience (the car's choice shouldn't follow the phone), so browser
 * storage rather than the server; falls back to the default if storage is unavailable. */
export function loadQuality(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Quality {
  try {
    const v = storage?.getItem(KEY)
    return isQuality(v) ? v : DEFAULT
  } catch {
    return DEFAULT
  }
}

export function saveQuality(q: Quality, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, q)
  } catch {
    // Unavailable storage: the choice just lasts for this page.
  }
}

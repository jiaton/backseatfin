import type { EngineKind } from './engines/types'

/** Stream quality presets (mirrors backend `stream.ports.QUALITY_PRESETS` and
 * `H264_QUALITY_PRESETS`; the WS query param is not part of the OpenAPI schema, so
 * this is the one hand-kept mirror). Same four levels, different resolutions per engine:
 * hardware H.264 decodes 1080p easily, JS-decoded MPEG-1 doesn't. */
export const QUALITY_VALUES = ['low', 'medium', 'high', 'max'] as const
export type Quality = (typeof QUALITY_VALUES)[number]

/** Output height per level and engine (the level's name comes from i18n). */
export const QUALITY_HEIGHTS: Record<EngineKind, Record<Quality, number>> = {
  webcodecs: { low: 480, medium: 720, high: 1080, max: 1080 },
  jsmpeg: { low: 480, medium: 720, high: 720, max: 1080 },
  hls: { low: 480, medium: 720, high: 1080, max: 1080 },
}

/** H.264 video bitrate per level, kbit/s (mirrors the server's H264_QUALITY_PRESETS;
 * a media server's HLS transcode is asked for the same). */
export const H264_KBPS: Record<Quality, number> = { low: 800, medium: 1500, high: 3000, max: 6000 }

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

import type { EngineKind } from './engines/types'

/**
 * Who transcodes for the player. Normally the media server itself (its own HLS). On Emby
 * with the optional BackseatFin server installed, that server can do it instead: it
 * tone-maps HDR / Dolby Vision properly (Emby's own tone mapping often doesn't), and it's
 * the only way to play in a browser without WebCodecs (JSMpeg).
 *
 * 'auto' = the BackseatFin server for HDR films (or without WebCodecs), the media server
 * for everything else.
 */
export const TRANSCODERS = ['auto', 'server', 'backseatfin'] as const
export type Transcoder = (typeof TRANSCODERS)[number]

const KEY = 'backseatfin:transcoder'

const isTranscoder = (v: unknown): v is Transcoder => TRANSCODERS.some((x) => x === v)

/** Per browser, like quality. */
export function loadTranscoder(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Transcoder {
  try {
    const v = storage?.getItem(KEY)
    return isTranscoder(v) ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function saveTranscoder(v: Transcoder, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, v)
  } catch {
    // remembered for this page only
  }
}

/** Whether the BackseatFin server should transcode this item. */
export function prefersBackseatfin(pref: Transcoder, hdr: boolean, engine: EngineKind): boolean {
  if (engine !== 'webcodecs') return true // the media server's HLS needs WebCodecs
  return pref === 'backseatfin' || (pref === 'auto' && hdr)
}

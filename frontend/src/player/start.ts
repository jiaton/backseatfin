// Shared start-up for the car player: read the hand-off, pick who transcodes, mount.
import { HttpError } from './api'
import { pickEngine } from './engines/detect'
import { mountPlayer, showMessage } from './page'
import { readPlayerParams } from './params'
import type { PlaybackSource } from './source'
import { createBackseatfinSource } from './sources/backseatfin'
import { createServerSource, type MediaServer, ServerError, serverRoot } from './sources/mediaserver'
import { loadTranscoder, saveTranscoder, prefersBackseatfin } from './transcoder'

const BACKEND_PROBE_MS = 2000

/** Whether the optional BackseatFin server answers next to the player (/car/health on
 * the Emby car host). Without it, the media server transcodes, which is the default. */
async function backendAvailable(): Promise<boolean> {
  try {
    const response = await fetch('health', { cache: 'no-store', signal: AbortSignal.timeout(BACKEND_PROBE_MS) })
    return response.ok && ((await response.json()) as { status?: string }).status === 'ok'
  } catch {
    return false
  }
}

/** `backend`: look for the BackseatFin server (Emby's car host may have one; the
 * Jellyfin plugin never does). */
export async function startPlayer(server: MediaServer, { backend = false } = {}) {
  const root = serverRoot(window.location.pathname)
  const params = readPlayerParams(window.location.search, root)
  if (!params) return showMessage('noItem', server, {}, root)
  try {
    const [engine, hasBackend] = await Promise.all([pickEngine(), backend ? backendAvailable() : false])
    if (engine !== 'webcodecs' && !hasBackend) return showMessage('needsWebCodecs', server, {}, root)
    const pref = loadTranscoder()
    // The media server's item says whether it's HDR (which 'auto' sends to our server).
    let source: PlaybackSource | null = engine === 'webcodecs' ? await createServerSource(server, params.item, root) : null
    if (hasBackend && prefersBackseatfin(pref, Boolean(source?.item.hdr), engine)) source = await createBackseatfinSource(params.item, engine)
    mountPlayer(source!, params, {
      transcoder: hasBackend
        ? {
            value: pref,
            pick: (next, at) => {
              saveTranscoder(next)
              // A different source, so a fresh page: the same film, where it was, with
              // the same tracks (both sources number tracks the way Emby does).
              const q = new URLSearchParams(window.location.search)
              q.set('t', String(Math.floor(at.t)))
              for (const k of ['audio', 'sub'] as const) {
                if (at[k] == null) q.delete(k)
                else q.set(k, String(at[k]))
              }
              window.location.replace(`${window.location.pathname}?${q}`)
            },
          }
        : undefined,
    })
  } catch (e) {
    const status = e instanceof ServerError || e instanceof HttpError ? e.status : 0
    if (status === 401) showMessage('signedOut', server, {}, root)
    else showMessage('loadFailed', server, { detail: String(e) }, root)
  }
}

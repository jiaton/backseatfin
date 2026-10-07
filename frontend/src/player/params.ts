export interface PlayerParams {
  item: string
  t: number
  audio?: number
  sub?: number
  back: string
  /** Opened as a layer inside Emby's page (inject.js): "back" closes the layer instead
   * of navigating, so Emby never reloads. */
  embed: boolean
}

export interface EmbyCredentials {
  token: string
  userId: string
}

export const CREDENTIALS_KEY = 'backseatfin:emby'
/** Must equal inject/parse.ts CLOSE_MESSAGE (a copy, not an import, so inject.js stays
 * one standalone file; params.test.ts checks they match). */
export const CLOSE_MESSAGE = 'backseatfin:close'
const DEFAULT_BACK = '/web/index.html'

const optInt = (v: string | null) => (v != null && /^\d+$/.test(v) ? Number(v) : undefined)

/** Reads /car/play?item=…&t=…&audio=…&sub=…&back=… . `back` must stay inside Emby's
 * own web app (a relative /web/ path) — anything else would be an open redirect. */
export function readPlayerParams(search: string): PlayerParams | null {
  const q = new URLSearchParams(search)
  const item = q.get('item')
  if (!item || !/^[A-Za-z0-9]+$/.test(item)) return null
  const back = q.get('back') ?? ''
  return {
    item,
    t: optInt(q.get('t')) ?? 0,
    audio: optInt(q.get('audio')),
    sub: optInt(q.get('sub')),
    back: back.startsWith('/web/') ? back : DEFAULT_BACK,
    embed: q.get('embed') === '1',
  }
}

/** Left by the inject script in this tab's sessionStorage. Kept (not consumed) so a
 * reload of the player page can re-establish its session. */
export function readEmbyCredentials(storage: Pick<Storage, 'getItem'> = sessionStorage): EmbyCredentials | null {
  try {
    const raw = storage.getItem(CREDENTIALS_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<EmbyCredentials>) : null
    return parsed?.token && parsed.userId ? { token: parsed.token, userId: parsed.userId } : null
  } catch {
    return null
  }
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

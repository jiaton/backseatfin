export interface PlayerParams {
  item: string
  t: number
  audio?: number
  sub?: number
  back: string
  /** Opened as a layer inside the media server's page (inject.js): "back" closes the
   * layer instead of navigating, so the server's page never reloads. */
  embed: boolean
}

/** The viewer's media server session, as its own web app holds it. */
export interface SessionCredentials {
  token: string
  userId: string
}

/** Must equal inject/parse.ts CREDENTIALS_KEY (a copy, so inject.js stays standalone; params.test.ts checks). */
export const CREDENTIALS_KEY = 'backseatfin:session'
/** Must equal inject/parse.ts CLOSE_MESSAGE (a copy, not an import, so inject.js stays
 * one standalone file; params.test.ts checks they match). */
export const CLOSE_MESSAGE = 'backseatfin:close'

const optInt = (v: string | null) => (v != null && /^\d+$/.test(v) ? Number(v) : undefined)

/** Reads play?item=…&t=…&audio=…&sub=…&back=… . `back` must stay inside the media
 * server's own web app (a relative <root>/web/ path) — anything else would be an open
 * redirect. `root`: the server's base path, if it runs under one (Jellyfin's base URL). */
export function readPlayerParams(search: string, root = ''): PlayerParams | null {
  const q = new URLSearchParams(search)
  const item = q.get('item')
  if (!item || !/^[A-Za-z0-9-]+$/.test(item)) return null
  const back = q.get('back') ?? ''
  return {
    item,
    t: optInt(q.get('t')) ?? 0,
    audio: optInt(q.get('audio')),
    sub: optInt(q.get('sub')),
    back: back.startsWith(`${root}/web/`) ? back : `${root}/web/`,
    embed: q.get('embed') === '1',
  }
}

/** Left by the inject script in this tab's sessionStorage. Kept (not consumed) so a
 * reload of the player page can re-establish its session. */
export function readSessionCredentials(storage: Pick<Storage, 'getItem'> = sessionStorage): SessionCredentials | null {
  try {
    const raw = storage.getItem(CREDENTIALS_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<SessionCredentials>) : null
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

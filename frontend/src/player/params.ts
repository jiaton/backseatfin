export interface PlayerParams {
  item: string
  t: number
  audio?: number
  sub?: number
  back: string
  /** Opened as a layer inside the media server's page (inject.js): "back" closes the
   * layer instead of navigating, so the server's page never reloads. */
  embed: boolean
  /** The media server's origin, when this player is hosted elsewhere (GitHub Pages). */
  server?: string
}

/** The viewer's media server session, as its own web app holds it. */
export interface SessionCredentials {
  token: string
  userId: string
}

/** Must equal inject/parse.ts CREDENTIALS_KEY (a copy, so inject.js stays standalone; params.test.ts checks). */
export const CREDENTIALS_KEY = 'backseatfin:session'
/** Must equal inject/parse.ts READY_MESSAGE / SESSION_MESSAGE (copies; params.test.ts checks). */
export const READY_MESSAGE = 'backseatfin:ready'
export const SESSION_MESSAGE = 'backseatfin:session'
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
    server: serverOrigin(q.get('server')),
  }
}

/** An http(s) origin and nothing else (no path, no credentials), or undefined. */
function serverOrigin(raw: string | null): string | undefined {
  if (!raw) return undefined
  try {
    const u = new URL(raw)
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.origin === raw ? raw : undefined
  } catch {
    return undefined
  }
}

/** Reads play?yt=<video id>&t=…&back=… (a YouTube video from our own app). `back` must
 * be a path in this app (not "//other.host"). */
export function readTubeParams(search: string): PlayerParams | null {
  const q = new URLSearchParams(search)
  const id = q.get('yt')
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null
  const back = q.get('back') ?? ''
  const appPath = back.startsWith('/') && !back.startsWith('//') && !back.startsWith('/\\')
  return { item: id, t: optInt(q.get('t')) ?? 0, back: appPath ? back : '/', embed: false }
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

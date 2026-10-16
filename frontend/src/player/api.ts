import type { components } from '@/lib/api/schema' // types only: no runtime cost

import { API_PREFIX } from './net'

export type PlaybackItem = components['schemas']['PlaybackItemOut']
export type TubeVideo = components['schemas']['TubeVideoOut']
type TubeProgress = components['schemas']['TubeProgressIn']
export type Track = components['schemas']['TrackOut']
export type SubtitleStatus = components['schemas']['SubtitleStatusOut']
type ReportIn = components['schemas']['PlaybackReportIn']
export type PlaybackEvent = ReportIn['event']

export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Plain fetch against our API (the player page carries no API client library). Auth
 * is the HttpOnly player cookie, sent automatically on same-origin requests. */
async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_PREFIX}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })
  if (!response.ok) {
    const detail = await response.json().then((j: { detail?: unknown }) => j.detail).catch(() => undefined)
    throw new HttpError(response.status, typeof detail === 'string' ? detail : response.statusText)
  }
  const text = await response.text() // some endpoints answer 204 with no body
  return (text ? JSON.parse(text) : undefined) as T
}

/** Trades the viewer's Emby token (left in sessionStorage by inject.js) for the player
 * cookie. Without one, an existing cookie is relied on. */
export async function startPlayerSession(credentials: { token: string; userId: string } | null) {
  if (!credentials) return
  await call('POST', '/api/auth/player-session', { emby_token: credentials.token, emby_user_id: credentials.userId })
}

export const fetchItem = (itemId: string) => call<PlaybackItem>('GET', `/api/emby/items/${encodeURIComponent(itemId)}`)

/** Starts extracting a text subtitle (idempotent) and says where it stands. */
export const prepareSubtitle = (itemId: string, mediaSourceId: string, index: number) =>
  call<SubtitleStatus>(
    'POST',
    `/api/emby/items/${encodeURIComponent(itemId)}/subtitles/${index}/prepare?media_source_id=${encodeURIComponent(mediaSourceId)}`,
  )

/** Reports playback to Emby (through our API, which holds the viewer's token), so the
 * resume position and "watched" stay in sync with every other Emby client. */
export function createReporter(itemId: string, mediaSourceId: string) {
  const playSessionId = crypto.randomUUID()
  const path = `/api/emby/items/${encodeURIComponent(itemId)}/playback`
  return (event: PlaybackEvent, positionSeconds: number, isPaused = false, { leaving = false } = {}) => {
    const body: ReportIn = {
      event,
      media_source_id: mediaSourceId,
      play_session_id: playSessionId,
      position_seconds: Math.max(0, positionSeconds),
      is_paused: isPaused,
    }
    if (leaving) {
      // The page is going away: a beacon survives that (and carries the cookie).
      navigator.sendBeacon(`${API_PREFIX}${path}`, new Blob([JSON.stringify(body)], { type: 'application/json' }))
      return
    }
    // Best-effort: a lost progress report only costs resume accuracy.
    call('POST', path, body).catch(() => {})
  }
}

export type TubeCue = components['schemas']['TubeCueOut']

export const fetchTubeCaptions = (videoId: string, trackId: string) =>
  call<TubeCue[]>('GET', `/api/tube/videos/${encodeURIComponent(videoId)}/captions/${encodeURIComponent(trackId)}`)

export const fetchTubeVideo = (videoId: string) => call<TubeVideo>('GET', `/api/tube/videos/${encodeURIComponent(videoId)}`)

/** Remembers how far a YouTube video got (the home screen's "continue watching").
 * `leaving`: the page is going away, so a beacon carries it. */
export function reportTubeProgress(videoId: string, positionSeconds: number, durationSeconds: number | null, leaving = false) {
  const path = `/api/tube/videos/${encodeURIComponent(videoId)}/progress`
  const body: TubeProgress = { position_seconds: Math.max(0, positionSeconds), duration_seconds: durationSeconds }
  if (leaving) {
    navigator.sendBeacon(`${API_PREFIX}${path}`, new Blob([JSON.stringify(body)], { type: 'application/json' }))
    return
  }
  call('POST', path, body).catch(() => {})
}

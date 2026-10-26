import { withStart } from '../engines/hls'
import { readSessionCredentials, type SessionCredentials } from '../params'
import { type Level, MEDIA_SERVER_LEVELS } from '../quality'
import { episodeTitle, type PlaybackEvent, type PlaybackSource, type StreamChoice, type Track } from '../source'

/**
 * Emby or Jellyfin, straight from the browser — no BackseatFin server. The media server
 * transcodes to HLS (H.264 + AAC in MPEG-TS, subtitles burned in) and the `hls` engine
 * plays it on a canvas. The player page is served on the media server's own origin (by
 * the Jellyfin plugin, or by the car host in front of Emby), so it uses the viewer's
 * session as is: the server checks every request itself. Both servers share this API
 * (Jellyfin forked from Emby): same paths, header and parameters.
 */

export type MediaServer = 'Emby' | 'Jellyfin'

export const CLIENT_NAME = 'BackseatFin'
const CLIENT_VERSION = '0.4.10'
const DEVICE_KEY = 'backseatfin:device'
const TICKS_PER_SECOND = 10_000_000
const AUDIO_BITRATE = 128_000

export class ServerError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Where the media server lives: the path before the player's /BackseatFin/ (Jellyfin's
 * plugin; Jellyfin may run under a base URL such as /jellyfin) or /car/ (the Emby car
 * host). */
export function serverRoot(pathname: string): string {
  const m = /\/(?:backseatfin|car)\//i.exec(pathname)
  return m ? pathname.slice(0, m.index) : ''
}

/** Where each web app keeps its sign-ins. */
const WEB_APP_CREDENTIALS: Record<MediaServer, string> = { Emby: 'servercredentials3', Jellyfin: 'jellyfin_credentials' }

/** The session inject.js left in this tab, else the one the server's web app keeps. */
export function readServerCredentials(
  server: MediaServer,
  session: Pick<Storage, 'getItem'> = sessionStorage,
  local: Pick<Storage, 'getItem'> = localStorage,
): SessionCredentials | null {
  const left = readSessionCredentials(session)
  if (left) return left
  try {
    const stored = JSON.parse(local.getItem(WEB_APP_CREDENTIALS[server]) ?? 'null') as {
      Servers?: { AccessToken?: string; UserId?: string }[]
    } | null
    const signedIn = stored?.Servers?.find((s) => s.AccessToken && s.UserId)
    return signedIn ? { token: signedIn.AccessToken!, userId: signedIn.UserId! } : null
  } catch {
    return null
  }
}

/** A stable id for this browser as a media server device (its own, not the web app's, so
 * stopping our transcodes never touches the web app's). */
export function deviceId(storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): string {
  try {
    const known = storage.getItem(DEVICE_KEY)
    if (known) return known
  } catch {
    // storage unavailable: a fresh id per page is fine
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  try {
    storage.setItem(DEVICE_KEY, id)
  } catch {
    // as above
  }
  return id
}

const quote = (v: string) => v.replace(/["\\]/g, '')

export function authorization(token: string, device: string): string {
  return `MediaBrowser Client="${CLIENT_NAME}", Device="Car browser", DeviceId="${quote(device)}", Version="${CLIENT_VERSION}", Token="${quote(token)}"`
}

interface JfStream {
  Type: string
  Index: number
  DisplayTitle?: string
  Title?: string
  Language?: string
  IsDefault?: boolean
  IsTextSubtitleStream?: boolean
  VideoRange?: string
}

interface JfItem {
  Id: string
  Name: string
  SeriesName?: string
  ParentIndexNumber?: number
  IndexNumber?: number
  RunTimeTicks?: number
  MediaSources?: { Id: string; MediaStreams?: JfStream[] }[]
}

/** HDR or Dolby Vision ("HDR", "HDR 10", "DolbyVision"… — anything but SDR). */
const isHdr = (streams: JfStream[]) => {
  const range = streams.find((s) => s.Type === 'Video')?.VideoRange
  return Boolean(range) && range!.toUpperCase() !== 'SDR'
}

function track(s: JfStream): Track {
  return {
    index: s.Index,
    title: s.DisplayTitle || s.Title || s.Language || `#${s.Index}`,
    kind: s.Type === 'Subtitle' ? (s.IsTextSubtitleStream ? 'text' : 'image') : undefined,
    isDefault: Boolean(s.IsDefault),
  }
}

/** HLS transcode parameters for one choice of tracks, quality level and screen size. */
export function streamQuery(
  mediaSourceId: string,
  playSessionId: string,
  device: string,
  choice: StreamChoice,
  level: Level,
): URLSearchParams {
  const { w, h } = choice.box
  const fits = w >= 160 && h >= 120
  const q = new URLSearchParams({
    MediaSourceId: mediaSourceId,
    PlaySessionId: playSessionId,
    DeviceId: device,
    VideoCodec: 'h264',
    AudioCodec: 'aac',
    // Stereo AAC is all WebAudio needs, and what the car's speakers get anyway.
    MaxAudioChannels: '2',
    TranscodingMaxAudioChannels: '2',
    SegmentContainer: 'ts',
    // The server picks the width from this (see MEDIA_SERVER_LEVELS).
    VideoBitrate: String(level.kbps * 1000),
    AudioBitrate: String(AUDIO_BITRATE),
    // Never more than the level, and never more than the screen can show.
    MaxHeight: String(fits ? Math.min(level.height, h) : level.height),
    MaxWidth: String(fits ? Math.min(level.width, w) : level.width),
  })
  if (choice.audio != null) q.set('AudioStreamIndex', String(choice.audio))
  if (choice.sub != null) {
    q.set('SubtitleStreamIndex', String(choice.sub))
    q.set('SubtitleMethod', 'Encode') // burned in: the canvas has no text tracks
  } else {
    q.set('SubtitleStreamIndex', '-1')
  }
  return q
}

const choiceKey = (c: StreamChoice) => JSON.stringify([c.quality, c.audio, c.sub, c.box.w, c.box.h])

/** A player hosted on another origin than the server: where the server is (its origin
 * + base path) and the viewer's session, which the server's page handed over. */
export interface HostedServer {
  base: string
  credentials: SessionCredentials | null
}

export async function createServerSource(server: MediaServer, itemId: string, root = '', hosted?: HostedServer): Promise<PlaybackSource> {
  const credentials = hosted ? hosted.credentials : readServerCredentials(server)
  // Requests go to the server: same origin (relative), or its full address when hosted.
  const base = hosted ? hosted.base : root
  if (!credentials) throw new ServerError(401, 'not signed in')
  const device = deviceId()
  const auth = authorization(credentials.token, device)

  const call = async (method: string, path: string, body?: unknown, keepalive = false) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: auth, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      keepalive,
    })
    if (!response.ok) throw new ServerError(response.status, `${method} ${path.split('?')[0]}: HTTP ${response.status}`)
    return response
  }

  const item = (await (
    await call('GET', `/Users/${encodeURIComponent(credentials.userId)}/Items/${encodeURIComponent(itemId)}`)
  ).json()) as JfItem
  const media = item.MediaSources?.[0]
  if (!media) throw new ServerError(404, 'no playable media')
  const streams = media.MediaStreams ?? []

  // One server transcode per choice of tracks/quality/size. Seeking keeps it (the server
  // restarts its encoder at the segment we ask for); a new choice gets a new one, and the
  // old one is stopped so the server doesn't keep encoding for nobody.
  let session = { key: '', id: '' }
  const stopEncoding = (id: string, keepalive = false) => {
    if (!id) return
    const q = new URLSearchParams({ deviceId: device, playSessionId: id })
    call('DELETE', `/Videos/ActiveEncodings?${q}`, undefined, keepalive).catch(() => {})
  }
  const sessionFor = (choice: StreamChoice) => {
    const key = choiceKey(choice)
    if (key !== session.key) {
      stopEncoding(session.id)
      session = { key, id: crypto.getRandomValues(new Uint32Array(4)).join('') }
    }
    return session.id
  }

  const ENDPOINT: Record<PlaybackEvent, string> = {
    start: '/Sessions/Playing',
    progress: '/Sessions/Playing/Progress',
    stopped: '/Sessions/Playing/Stopped',
  }

  return {
    server,
    item: {
      id: item.Id,
      title: episodeTitle(item.Name, item.SeriesName, item.ParentIndexNumber, item.IndexNumber),
      duration: item.RunTimeTicks ? item.RunTimeTicks / TICKS_PER_SECOND : Number.NaN,
      audioTracks: streams.filter((s) => s.Type === 'Audio').map(track),
      subtitleTracks: streams.filter((s) => s.Type === 'Subtitle').map(track),
      hdr: isHdr(streams),
    },
    engines: ['hls'],
    levels: () => MEDIA_SERVER_LEVELS[server],
    streamUrl: (start, _engine, choice) => {
      const q = streamQuery(media.Id, sessionFor(choice), device, choice, MEDIA_SERVER_LEVELS[server][choice.quality])
      return withStart(`${hosted ? base : window.location.origin + root}/Videos/${encodeURIComponent(item.Id)}/master.m3u8?${q}`, start)
    },
    headers: () => ({ Authorization: auth }),
    report: (event, position, choice, opts = {}) => {
      const body = {
        ItemId: item.Id,
        MediaSourceId: media.Id,
        PlaySessionId: sessionFor(choice),
        PositionTicks: Math.round(Math.max(0, position) * TICKS_PER_SECOND),
        IsPaused: opts.paused ?? false,
        AudioStreamIndex: choice.audio,
        SubtitleStreamIndex: choice.sub ?? -1,
        PlayMethod: 'Transcode',
        CanSeek: true,
      }
      // keepalive: the request survives the page going away.
      call('POST', ENDPOINT[event], body, opts.leaving).catch(() => {})
      if (event === 'stopped') stopEncoding(session.id, opts.leaving)
    },
  }
}

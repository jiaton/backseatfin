import { withStart } from '../engines/hls'
import { readSessionCredentials, type SessionCredentials } from '../params'
import { H264_KBPS, QUALITY_HEIGHTS } from '../quality'
import { episodeTitle, type PlaybackEvent, type PlaybackSource, type StreamChoice, type Track } from '../source'

/**
 * Jellyfin, straight from the browser — no BackseatFin server. Jellyfin transcodes to
 * HLS (H.264 + AAC in MPEG-TS, subtitles burned in) and the `hls` engine plays it on a
 * canvas. The player page is served by the BackseatFin Jellyfin plugin on Jellyfin's
 * own origin, so it uses the viewer's Jellyfin session as is.
 */

export const CLIENT_NAME = 'BackseatFin'
const CLIENT_VERSION = '0.1.0'
const DEVICE_KEY = 'backseatfin:device'
const TICKS_PER_SECOND = 10_000_000
const AUDIO_BITRATE = 128_000

export class JellyfinError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Where Jellyfin lives: the path before the plugin's /BackseatFin/ (Jellyfin may run
 * under a base URL such as /jellyfin). */
export function serverRoot(pathname: string): string {
  const i = pathname.toLowerCase().indexOf('/backseatfin/')
  return i < 0 ? '' : pathname.slice(0, i)
}

/** The session inject.js left in this tab, else the one Jellyfin's web app keeps. */
export function readJellyfinCredentials(
  session: Pick<Storage, 'getItem'> = sessionStorage,
  local: Pick<Storage, 'getItem'> = localStorage,
): SessionCredentials | null {
  const left = readSessionCredentials(session)
  if (left) return left
  try {
    const stored = JSON.parse(local.getItem('jellyfin_credentials') ?? 'null') as {
      Servers?: { AccessToken?: string; UserId?: string }[]
    } | null
    const server = stored?.Servers?.find((s) => s.AccessToken && s.UserId)
    return server ? { token: server.AccessToken!, userId: server.UserId! } : null
  } catch {
    return null
  }
}

/** A stable id for this browser as a Jellyfin device (its own, not the web app's, so
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

function track(s: JfStream): Track {
  return {
    index: s.Index,
    title: s.DisplayTitle || s.Title || s.Language || `#${s.Index}`,
    kind: s.Type === 'Subtitle' ? (s.IsTextSubtitleStream ? 'text' : 'image') : undefined,
    isDefault: Boolean(s.IsDefault),
  }
}

/** HLS transcode parameters for one choice of tracks, quality and screen size. */
export function streamQuery(
  mediaSourceId: string,
  playSessionId: string,
  device: string,
  choice: StreamChoice,
): URLSearchParams {
  const level = QUALITY_HEIGHTS.hls[choice.quality]
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
    VideoBitrate: String(H264_KBPS[choice.quality] * 1000),
    AudioBitrate: String(AUDIO_BITRATE),
    // Never more than the level, and never more than the screen can show.
    MaxHeight: String(fits ? Math.min(level, h) : level),
  })
  if (fits) q.set('MaxWidth', String(w))
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

export async function createJellyfinSource(itemId: string, root = ''): Promise<PlaybackSource> {
  const credentials = readJellyfinCredentials()
  if (!credentials) throw new JellyfinError(401, 'not signed in')
  const device = deviceId()
  const auth = authorization(credentials.token, device)

  const call = async (method: string, path: string, body?: unknown, keepalive = false) => {
    const response = await fetch(`${root}${path}`, {
      method,
      headers: { Authorization: auth, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      keepalive,
    })
    if (!response.ok) throw new JellyfinError(response.status, `${method} ${path.split('?')[0]}: HTTP ${response.status}`)
    return response
  }

  const item = (await (
    await call('GET', `/Items/${encodeURIComponent(itemId)}?userId=${encodeURIComponent(credentials.userId)}`)
  ).json()) as JfItem
  const media = item.MediaSources?.[0]
  if (!media) throw new JellyfinError(404, 'no playable media')
  const streams = media.MediaStreams ?? []

  // One Jellyfin transcode per choice of tracks/quality/size. Seeking keeps it (Jellyfin
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
    server: 'Jellyfin',
    item: {
      id: item.Id,
      title: episodeTitle(item.Name, item.SeriesName, item.ParentIndexNumber, item.IndexNumber),
      duration: item.RunTimeTicks ? item.RunTimeTicks / TICKS_PER_SECOND : Number.NaN,
      audioTracks: streams.filter((s) => s.Type === 'Audio').map(track),
      subtitleTracks: streams.filter((s) => s.Type === 'Subtitle').map(track),
    },
    engines: ['hls'],
    streamUrl: (start, _engine, choice) => {
      const q = streamQuery(media.Id, sessionFor(choice), device, choice)
      return withStart(`${window.location.origin}${root}/Videos/${encodeURIComponent(item.Id)}/master.m3u8?${q}`, start)
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

/**
 * Just enough HLS for a media server's VOD transcode: a master playlist (we take its
 * first variant — the server made exactly the one we asked for) and a media playlist of
 * MPEG-TS segments. Pure functions; the fetching lives in hls-engine.ts.
 */

export interface Segment {
  /** Absolute URL. */
  url: string
  /** Seconds from the start of the media. */
  start: number
  duration: number
}

const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

/** The first variant's URL if `text` is a master playlist, else null (it's already a
 * media playlist). */
export function firstVariant(text: string, base: string): string | null {
  const all = lines(text)
  const i = all.findIndex((l) => l.startsWith('#EXT-X-STREAM-INF'))
  if (i < 0) return null
  const uri = all.slice(i + 1).find((l) => !l.startsWith('#'))
  return uri ? new URL(uri, base).href : null
}

/** The subtitle rendition's playlist URL in a master playlist (the server sends the one
 * track we asked for), else null. */
export function subtitleRendition(text: string, base: string): string | null {
  const media = lines(text).find((l) => l.startsWith('#EXT-X-MEDIA:') && l.includes('TYPE=SUBTITLES'))
  const uri = media && /URI="([^"]+)"/.exec(media)
  return uri ? new URL(uri[1], base).href : null
}

export function parseMediaPlaylist(text: string, base: string): Segment[] {
  const segments: Segment[] = []
  let start = 0
  let duration: number | null = null
  for (const l of lines(text)) {
    if (l.startsWith('#EXTINF:')) {
      duration = Number.parseFloat(l.slice(8))
    } else if (!l.startsWith('#') && duration != null) {
      segments.push({ url: new URL(l, base).href, start, duration })
      start += duration
      duration = null
    }
  }
  return segments
}

/** Index of the segment that contains `t` (the last one past the end). */
export function segmentAt(segments: Segment[], t: number): number {
  for (let i = segments.length - 1; i >= 0; i--) if (segments[i].start <= t + 1e-6) return i
  return 0
}

/** An HLS stream URL for the player carries its start position in the fragment
 * (`…/master.m3u8?…#t=125.5`), like a media fragment; the fragment never reaches the
 * server. */
export function withStart(url: string, seconds: number): string {
  return `${url.split('#')[0]}#t=${Math.max(0, seconds)}`
}

export function splitStart(url: string): { url: string; start: number } {
  const [bare, hash = ''] = url.split('#')
  const t = /(?:^|&)t=([\d.]+)/.exec(hash)
  return { url: bare, start: t ? Number(t[1]) : 0 }
}

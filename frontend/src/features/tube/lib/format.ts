import { HTML_LANG, type Lang } from '@/player/i18n'
import { API_PREFIX } from '@/lib/api/client'

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** 23429704 → "23M" / "2343万", in the viewer's language. */
export const formatCount = (n: number, lang: Lang) =>
  new Intl.NumberFormat(HTML_LANG[lang], { notation: 'compact', maximumFractionDigits: 1 }).format(n)

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86400], ['month', 30 * 86400], ['week', 7 * 86400], ['day', 86400], ['hour', 3600], ['minute', 60],
]

/** "3 days ago" in the viewer's language. */
export function formatAgo(iso: string, lang: Lang, now = Date.now()): string {
  const seconds = (new Date(iso).getTime() - now) / 1000
  const rtf = new Intl.RelativeTimeFormat(HTML_LANG[lang], { numeric: 'auto' })
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  }
  return rtf.format(0, 'minute')
}

/** A YouTube image through our server (the car never talks to Google for pictures). */
export const imageUrl = (url: string) => `${API_PREFIX}/api/tube/image?u=${encodeURIComponent(url)}`

export const videoPath = (id: string) => `/v/${encodeURIComponent(id)}`
export const channelPath = (id: string) => `/c/${encodeURIComponent(id)}`
export const playlistPath = (id: string) => `/p/${encodeURIComponent(id)}`

/** The car player for a video, starting at `t`; its back arrow returns to `back`. */
export function playerHref(id: string, t: number, back: string): string {
  const q = new URLSearchParams({ yt: id, t: String(Math.floor(Math.max(0, t))), back })
  return `/play?${q}`
}

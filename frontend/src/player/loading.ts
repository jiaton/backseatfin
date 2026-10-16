import type { EngineStats } from './engines/types'
import type { Translate } from './i18n'

/** What the player knows while it waits for a picture (start, seek, rebuffer). */
export interface LoadingInput {
  /** <car-video>'s stats: the engine's plus how many connections it took. */
  stats: EngineStats & { connects?: number }
  retrying: boolean
  /** Seconds since this wait began. */
  waited: number
  server: string
  /** The level's bitrate (what the stream needs), kbit/s. */
  needKbps: number
  /** e.g. "Standard · 1280×720 · 3.0 Mbps". */
  quality: string
  /** Where playback (re)starts, already formatted. */
  at: string
}

const mbps = (kbps: number) => `${(kbps / 1000).toFixed(1)} Mbps`
const megabytes = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`

/** The loading box: what's happening now, then the numbers that explain a slow start. */
export function loadingLines(t: Translate, i: LoadingInput): { stage: string; lines: string[] } {
  const s = i.stats
  const bytes = s.bytesReceived ?? 0
  const secs = i.waited.toFixed(0)
  const stage = i.retrying
    ? t('loadReconnecting', { s: secs })
    : bytes === 0
      ? t('loadPreparing', { server: i.server, s: secs })
      : s.framesDrawn === 0
        ? t('loadReceiving', { s: secs })
        : t('loadBuffering', { s: secs })
  const lines = [
    `${t('loadSpeed')}  ${s.receiveKbps ? mbps(s.receiveKbps) : '–'} · ${t('loadNeeds', { rate: mbps(i.needKbps) })}`,
    `${t('loadData')}  ${megabytes(bytes)} · ${t('loadBuffered', { s: (s.bufferAheadS ?? 0).toFixed(1) })}`,
  ]
  if (s.segment != null) {
    lines.push(`${t('loadSegment')}  #${s.segment}${s.segmentWaitMs != null ? ` · ${t('loadServerTook', { s: (s.segmentWaitMs / 1000).toFixed(1) })}` : ''}`)
  }
  lines.push(`${t('loadQuality')}  ${i.quality} · ${t('loadFrom', { time: i.at })}`)
  if ((s.connects ?? 0) > 1) lines.push(`${t('loadConnects')}  ${s.connects}`)
  return { stage, lines }
}

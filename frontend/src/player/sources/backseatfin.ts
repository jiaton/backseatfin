import { createReporter, fetchItem, prepareSubtitle, startPlayerSession } from '../api'
import { ENGINE_FORMAT, type EngineKind } from '../engines/types'
import { wsUrl } from '../net'
import { readSessionCredentials } from '../params'
import { episodeTitle, type PlaybackSource } from '../source'

/** Emby through our own server: it transcodes (H.264 for WebCodecs, MPEG-1 for JSMpeg)
 * and streams over a WebSocket, and relays progress to Emby with the viewer's token. */
export async function createBackseatfinSource(itemId: string, engine: EngineKind): Promise<PlaybackSource> {
  await startPlayerSession(readSessionCredentials())
  const item = await fetchItem(itemId)
  const report = createReporter(item.id, item.media_source_id)
  const tracks = (list: typeof item.audio_tracks) =>
    list.map((t) => ({ index: t.index, title: t.title, kind: t.kind, isDefault: t.is_default }))
  return {
    server: 'Emby',
    item: {
      id: item.id,
      title: episodeTitle(item.name, item.series_name, item.season_number, item.episode_number),
      duration: item.runtime_seconds ?? Number.NaN,
      audioTracks: tracks(item.audio_tracks),
      subtitleTracks: tracks(item.subtitle_tracks),
    },
    // WebCodecs falls back to JSMpeg on its own (car-video); start with what fits.
    engines: [engine],
    streamUrl: (start, kind, choice) => {
      const format = kind === 'jsmpeg' ? ENGINE_FORMAT.jsmpeg : ENGINE_FORMAT.webcodecs
      const q = new URLSearchParams({ source: `emby:${item.id}`, t: String(Math.floor(start)), quality: choice.quality, format })
      if (choice.audio != null) q.set('audio', String(choice.audio))
      if (choice.sub != null) q.set('sub', String(choice.sub))
      const { w, h } = choice.box
      if (w >= 160 && h >= 120) {
        q.set('maxw', String(Math.min(w, 4096)))
        q.set('maxh', String(Math.min(h, 4096)))
      }
      return wsUrl(`/api/stream/ws?${q}`)
    },
    report: (event, position, _choice, opts = {}) => report(event, position, opts.paused ?? false, { leaving: opts.leaving ?? false }),
    prepareSubtitle: async (index) => {
      const result = await prepareSubtitle(item.id, item.media_source_id, index)
      return result.status === 'pending' || result.status === 'ready' ? result.status : 'failed'
    },
  }
}

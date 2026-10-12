import { fetchTubeVideo, reportTubeProgress } from '../api'
import { ENGINE_FORMAT, type EngineKind } from '../engines/types'
import { wsUrl } from '../net'
import { SERVER_LEVELS, YOUTUBE_LEVELS } from '../quality'
import type { PlaybackSource } from '../source'

/** A YouTube video through our server: it extracts YouTube's streams and passes the
 * H.264 through untouched (sound re-encoded to AAC) over the stream WebSocket, or
 * transcodes to MPEG-1 for JSMpeg. Progress is kept by our server, not YouTube. */
export async function createYoutubeSource(videoId: string, engine: EngineKind): Promise<PlaybackSource> {
  const { video } = await fetchTubeVideo(videoId)
  const duration = video.duration_seconds ?? Number.NaN
  return {
    server: 'YouTube',
    item: {
      id: video.id,
      title: video.channel_name ? `${video.channel_name} · ${video.title}` : video.title,
      duration,
      audioTracks: [],
      subtitleTracks: [],
    },
    engines: [engine],
    reorder: true, // YouTube's H.264 has B-frames
    levels: (kind) => (kind === 'jsmpeg' ? SERVER_LEVELS.jsmpeg : YOUTUBE_LEVELS),
    streamUrl: (start, kind, choice) => {
      const format = kind === 'jsmpeg' ? ENGINE_FORMAT.jsmpeg : ENGINE_FORMAT.webcodecs
      const q = new URLSearchParams({ source: `youtube:${video.id}`, t: String(Math.floor(start)), quality: choice.quality, format })
      if (format === ENGINE_FORMAT.webcodecs) q.set('flow', '1')
      const { w, h } = choice.box
      if (w >= 160 && h >= 120) {
        q.set('maxw', String(Math.min(w, 4096)))
        q.set('maxh', String(Math.min(h, 4096)))
      }
      return wsUrl(`/api/stream/ws?${q}`)
    },
    report: (_event, position, _choice, opts = {}) =>
      reportTubeProgress(video.id, position, Number.isFinite(duration) ? duration : null, opts.leaving ?? false),
  }
}

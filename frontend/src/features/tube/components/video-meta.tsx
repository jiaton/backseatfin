import { formatAgo, formatCount, formatDuration } from '../lib/format'
import { useTubeT } from '../lib/strings'
import type { VideoCard } from '../types'

/** "Channel · 1.2M views · 3 days ago", or how much is left for a started video. */
export function VideoMeta({ video, showChannel = true }: { video: VideoCard; showChannel?: boolean }) {
  const { t, lang } = useTubeT()
  const parts: string[] = []
  if (showChannel && video.channel_name) parts.push(video.channel_name)
  if (video.position_seconds != null && video.duration_seconds) {
    parts.push(t('left', { time: formatDuration(video.duration_seconds - video.position_seconds) }))
  } else {
    if (video.view_count != null) parts.push(t('views', { n: formatCount(video.view_count, lang) }))
    if (video.published_at) parts.push(formatAgo(video.published_at, lang))
  }
  return <p className="truncate text-sm text-muted-foreground">{parts.join(' · ')}</p>
}

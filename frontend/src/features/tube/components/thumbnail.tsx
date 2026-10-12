import { cn } from '@/lib/utils'

import { formatDuration, imageUrl } from '../lib/format'
import { useTubeT } from '../lib/strings'
import type { VideoCard } from '../types'

/** A video's picture with its length, a LIVE badge, and how much was watched. */
export function Thumbnail({ video, className }: { video: VideoCard; className?: string }) {
  const { t } = useTubeT()
  const watched =
    video.position_seconds != null && video.duration_seconds ? Math.min(1, video.position_seconds / video.duration_seconds) : 0
  return (
    <div className={cn('relative aspect-video w-full overflow-hidden rounded-xl bg-muted', className)}>
      {video.thumbnail_url && (
        <img src={imageUrl(video.thumbnail_url)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      )}
      {video.is_live ? (
        <span className="absolute right-2 bottom-2 rounded-md bg-watched px-1.5 text-sm font-semibold text-foreground">{t('live')}</span>
      ) : (
        video.duration_seconds != null && (
          <span className="absolute right-2 bottom-2 rounded-md bg-scrim px-1.5 text-sm text-foreground tabular-nums">
            {formatDuration(video.duration_seconds)}
          </span>
        )
      )}
      {watched > 0 && (
        <span className="absolute inset-x-0 bottom-0 h-1 bg-scrim">
          <span className="block h-full bg-watched" style={{ width: `${watched * 100}%` }} />
        </span>
      )}
    </div>
  )
}

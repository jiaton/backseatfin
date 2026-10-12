import { Link } from '@/components/ui/link'

import { useSeedCard } from '../api/use-browse'
import { videoPath } from '../lib/format'
import type { VideoCard } from '../types'
import { Thumbnail } from './thumbnail'
import { VideoMeta } from './video-meta'

/** A video in a list (search results, playlists): picture left, text right. */
export function VideoRow({ video, compact = false }: { video: VideoCard; compact?: boolean }) {
  const seed = useSeedCard()
  return (
    <Link
      href={videoPath(video.id)}
      onClick={() => seed(video)}
      className={`grid items-start gap-4 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${compact ? 'grid-cols-[10rem_1fr]' : 'grid-cols-[minmax(0,18rem)_1fr] sm:grid-cols-[22rem_1fr]'}`}
    >
      <Thumbnail video={video} />
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className={`line-clamp-2 leading-snug font-medium ${compact ? 'text-sm' : 'text-lg'}`}>{video.title}</h3>
        <VideoMeta video={video} />
      </div>
    </Link>
  )
}

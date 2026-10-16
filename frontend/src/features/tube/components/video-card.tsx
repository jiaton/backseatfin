import { Link } from '@/components/ui/link'

import { useSeedCard } from '../api/use-browse'
import { videoPath } from '../lib/format'
import type { VideoCard as Video } from '../types'
import { Thumbnail } from './thumbnail'
import { VideoMeta } from './video-meta'

/** A video in a grid: picture, two lines of title, then channel and stats. */
export function VideoCard({ video, showChannel = true, list }: { video: Video; showChannel?: boolean; list?: string }) {
  const seed = useSeedCard()
  return (
    <Link href={videoPath(video.id, list)} onClick={() => seed(video)} className="group flex min-w-0 flex-col gap-2 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Thumbnail video={video} />
      <h3 className="line-clamp-2 text-base leading-snug font-medium group-active:text-muted-foreground">{video.title}</h3>
      <VideoMeta video={video} showChannel={showChannel} />
    </Link>
  )
}

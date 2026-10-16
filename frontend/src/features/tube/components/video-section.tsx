import type { ReactNode } from 'react'

import { Link } from '@/components/ui/link'

import type { VideoCard as Video } from '../types'
import { VideoCard } from './video-card'

/** A titled grid of videos (four across on the car's screen, two on a phone). */
export function VideoSection({ title, href, hint, videos, showChannel = true, action, list }: {
  title: string
  /** Where the title leads (a playlist's page), if anywhere. */
  href?: string
  hint?: string
  videos: Video[]
  showChannel?: boolean
  action?: ReactNode
  /** What plays next from this row (see videoPath). */
  list?: string
}) {
  if (!videos.length) return null
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold">
          {href ? (
            <Link href={href} className="rounded-md outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
              {title}
            </Link>
          ) : (
            title
          )}
        </h2>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        {action}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-4">
        {videos.map((v) => (
          <VideoCard key={v.id} video={v} showChannel={showChannel} list={list} />
        ))}
      </div>
    </section>
  )
}

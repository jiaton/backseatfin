import type { ReactNode } from 'react'

import type { VideoCard as Video } from '../types'
import { VideoCard } from './video-card'

/** A titled grid of videos (four across on the car's screen, two on a phone). */
export function VideoSection({ title, hint, videos, showChannel = true, action }: {
  title: string
  hint?: string
  videos: Video[]
  showChannel?: boolean
  action?: ReactNode
}) {
  if (!videos.length) return null
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        {action}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-4">
        {videos.map((v) => (
          <VideoCard key={v.id} video={v} showChannel={showChannel} />
        ))}
      </div>
    </section>
  )
}

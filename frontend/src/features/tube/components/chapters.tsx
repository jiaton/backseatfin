import { formatDuration, playerHref, videoPath } from '../lib/format'
import { useTubeT } from '../lib/strings'
import type { Chapter } from '../types'

/** Chapter chips: each one plays the video from there. */
export function Chapters({ videoId, chapters }: { videoId: string; chapters: Chapter[] }) {
  const { t } = useTubeT()
  if (!chapters.length) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{t('chapters')}</h2>
      <div className="flex flex-wrap gap-2">
        {chapters.map((c) => (
          <a
            key={c.start_seconds}
            href={playerHref(videoId, c.start_seconds, videoPath(videoId))}
            className="flex min-h-12 items-center gap-2 rounded-full bg-muted px-4 text-base outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="text-muted-foreground tabular-nums">{formatDuration(c.start_seconds)}</span>
            {c.title}
          </a>
        ))}
      </div>
    </section>
  )
}

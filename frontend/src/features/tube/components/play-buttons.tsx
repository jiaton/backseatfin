import { Play, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { formatDuration, playerHref, videoPath } from '../lib/format'
import { useTubeT } from '../lib/strings'

/** Play (or resume) and, for a started video, play from the start. The player is its
 * own page; its back arrow comes back here. */
export function PlayButtons({ videoId, resumeAt }: { videoId: string; resumeAt: number | null | undefined }) {
  const { t } = useTubeT()
  const back = videoPath(videoId)
  return (
    <>
      <Button asChild size="car" variant="brand">
        <a href={playerHref(videoId, resumeAt ?? 0, back)}>
          <Play aria-hidden />
          {resumeAt ? t('resumeFrom', { time: formatDuration(resumeAt) }) : t('play')}
        </a>
      </Button>
      {resumeAt ? (
        <Button asChild size="car" variant="secondary">
          <a href={playerHref(videoId, 0, back)}>
            <RotateCcw aria-hidden />
            {t('playFromStart')}
          </a>
        </Button>
      ) : null}
    </>
  )
}

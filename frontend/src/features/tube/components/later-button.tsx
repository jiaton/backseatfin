import { Clock, ClockCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { useWatchLater } from '../api/use-library'
import { useTubeT } from '../lib/strings'

export function LaterButton({ videoId, inLater }: { videoId: string; inLater: boolean }) {
  const { t } = useTubeT()
  const later = useWatchLater(videoId)
  return (
    <Button size="car" variant="secondary" aria-pressed={inLater} disabled={later.isPending} onClick={() => later.mutate(!inLater)}>
      {inLater ? <ClockCheck aria-hidden /> : <Clock aria-hidden />}
      {inLater ? t('inLater') : t('addLater')}
    </Button>
  )
}

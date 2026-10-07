import { Badge } from '@/components/ui/badge'
import { type Key, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

import type { VideoStatus } from '../types'

const LABEL: Record<VideoStatus, Key> = {
  queued: 'statusQueued',
  downloading: 'statusDownloading',
  done: 'statusDone',
  failed: 'statusFailed',
  cancelled: 'statusCancelled',
  interrupted: 'statusInterrupted',
}

const TONE: Record<VideoStatus, string> = {
  queued: 'text-status-muted',
  downloading: 'text-status-warning',
  done: 'text-status-good',
  failed: 'text-status-critical',
  cancelled: 'text-status-muted',
  interrupted: 'text-status-warning',
}

export function VideoStatusBadge({ status }: { status: VideoStatus }) {
  const { t } = useT()
  return (
    <Badge variant="outline" className={cn(TONE[status])}>
      {t(LABEL[status])}
    </Badge>
  )
}

import { RotateCcw, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { QueryState } from '@/components/ui/query-state'
import { useT } from '@/lib/i18n'

import { useCancelVideo, useRetryVideo, useVideos } from '../api/use-videos'
import type { Video } from '../types'
import { VideoStatusBadge } from './video-status-badge'

const RETRYABLE = new Set<Video['status']>(['failed', 'cancelled', 'interrupted'])
const CANCELLABLE = new Set<Video['status']>(['queued', 'downloading'])

function formatDuration(s: number | null) {
  if (!s) return ''
  const m = Math.floor(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`
}

function VideoRow({ video }: { video: Video }) {
  const { t } = useT()
  const retry = useRetryVideo()
  const cancel = useCancelVideo()
  return (
    <li className="flex items-center gap-3 py-2">
      <VideoStatusBadge status={video.status} />
      <div className="min-w-0 flex-1">
        <a
          href={`https://www.youtube.com/watch?v=${video.youtube_id}`}
          target="_blank"
          rel="noreferrer"
          className="line-clamp-1 hover:underline"
        >
          {video.title}
        </a>
        <p className="truncate text-xs text-muted-foreground">
          {[video.channel, formatDuration(video.duration_seconds), video.error].filter(Boolean).join(' · ')}
        </p>
      </div>
      {RETRYABLE.has(video.status) && (
        <Button variant="ghost" size="icon" aria-label={t('retryVideo', { title: video.title })} onClick={() => retry.mutate(video.id)}>
          <RotateCcw />
        </Button>
      )}
      {CANCELLABLE.has(video.status) && (
        <Button variant="ghost" size="icon" aria-label={t('cancelVideo', { title: video.title })} onClick={() => cancel.mutate(video.id)}>
          <X />
        </Button>
      )}
    </li>
  )
}

export function VideoList() {
  const { t } = useT()
  const videos = useVideos()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('queue')}</CardTitle>
      </CardHeader>
      <CardContent>
        <QueryState query={videos}>
          {(list) =>
            list.length ? (
              <ul className="divide-y">
                {list.map((v) => (
                  <VideoRow key={v.id} video={v} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('queueEmpty')}</p>
            )
          }
        </QueryState>
      </CardContent>
    </Card>
  )
}

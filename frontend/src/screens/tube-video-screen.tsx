import { Play } from 'lucide-react'

import { Link } from '@/components/ui/link'
import { QueryState } from '@/components/ui/query-state'
import { useChannel, useSeededCard, useVideo } from '@/features/tube/api/use-browse'
import { Avatar } from '@/features/tube/components/avatar'
import { Chapters } from '@/features/tube/components/chapters'
import { Description } from '@/features/tube/components/description'
import { FollowButton } from '@/features/tube/components/follow-button'
import { LaterButton } from '@/features/tube/components/later-button'
import { PlayButtons } from '@/features/tube/components/play-buttons'
import { Thumbnail } from '@/features/tube/components/thumbnail'
import { TubePage } from '@/features/tube/components/tube-page'
import { VideoMeta } from '@/features/tube/components/video-meta'
import { VideoRow } from '@/features/tube/components/video-row'
import { channelPath, playerHref, videoPath } from '@/features/tube/lib/format'
import { useTubeT } from '@/features/tube/lib/strings'

/** A video before playing it. The card the list showed draws at once; the details (and
 * YouTube's streams, so Play starts fast) arrive a few seconds later. */
export function TubeVideoScreen({ id, list }: { id: string; list?: string }) {
  const { t } = useTubeT()
  const page = useVideo(id)
  const seeded = useSeededCard(id)
  const video = page.data?.video ?? seeded
  const channel = useChannel(video?.channel_id)
  const more = (channel.data?.videos ?? []).filter((v) => v.id !== id).slice(0, 12)

  return (
    <TubePage>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          {video && (
            <>
              <a href={playerHref(id, video.position_seconds ?? 0, videoPath(id, list), list)} aria-label={t('play')} className="group relative block rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <Thumbnail video={video} className="rounded-2xl" />
                <span className="absolute inset-0 grid place-items-center">
                  <span className="grid size-24 place-items-center rounded-full bg-scrim group-active:scale-95">
                    <Play aria-hidden className="size-10 fill-current" />
                  </span>
                </span>
              </a>
              <h1 className="text-2xl leading-snug font-semibold text-balance">{video.title}</h1>
              <VideoMeta video={video} showChannel={false} />
              {video.channel_id && (
                <div className="flex flex-wrap items-center gap-4">
                  <Link href={channelPath(video.channel_id)} className="flex min-h-14 min-w-0 items-center gap-3 rounded-xl pr-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                    <Avatar url={channel.data?.channel.avatar_url} name={video.channel_name ?? '?'} />
                    <span className="truncate text-lg font-medium">{video.channel_name}</span>
                  </Link>
                  {page.data && <FollowButton channelId={video.channel_id} following={page.data.following} />}
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                {/* A live stream always starts at the live edge: nothing to resume. */}
                <PlayButtons videoId={id} resumeAt={video.is_live ? null : video.position_seconds} list={list} />
                {page.data && !video.is_live && <LaterButton videoId={id} inLater={page.data.later} />}
              </div>
            </>
          )}
          <QueryState query={page}>
            {(p) => (
              <>
                <Chapters videoId={id} chapters={p.chapters} />
                <Description text={p.description} />
              </>
            )}
          </QueryState>
        </div>
        {more.length > 0 && (
          <aside className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{t('moreFromChannel')}</h2>
            {more.map((v) => <VideoRow key={v.id} video={v} compact />)}
          </aside>
        )}
      </div>
    </TubePage>
  )
}

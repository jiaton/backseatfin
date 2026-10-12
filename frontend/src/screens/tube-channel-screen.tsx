import { QueryState } from '@/components/ui/query-state'
import { useChannel } from '@/features/tube/api/use-browse'
import { Avatar } from '@/features/tube/components/avatar'
import { FollowButton } from '@/features/tube/components/follow-button'
import { TubePage } from '@/features/tube/components/tube-page'
import { VideoSection } from '@/features/tube/components/video-section'
import { formatCount, imageUrl } from '@/features/tube/lib/format'
import { useTubeT } from '@/features/tube/lib/strings'

export function TubeChannelScreen({ id }: { id: string }) {
  const { t, lang } = useTubeT()
  const page = useChannel(id)
  return (
    <TubePage>
      <QueryState query={page}>
        {({ channel, banner_url, videos, following }) => (
          <div className="flex flex-col gap-6">
            {banner_url && (
              <img src={imageUrl(banner_url)} alt="" className="aspect-[6/1] w-full rounded-2xl bg-muted object-cover" />
            )}
            <div className="flex flex-wrap items-center gap-5">
              <Avatar url={channel.avatar_url} name={channel.name} className="size-20 text-2xl" />
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-2xl font-semibold">{channel.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {[channel.handle, channel.subscriber_count != null && t('subscribers', { n: formatCount(channel.subscriber_count, lang) })]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <FollowButton channelId={channel.id} following={following} />
            </div>
            <VideoSection title={t('videos')} videos={videos} showChannel={false} />
          </div>
        )}
      </QueryState>
    </TubePage>
  )
}

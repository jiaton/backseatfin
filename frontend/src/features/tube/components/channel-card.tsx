import { Link } from '@/components/ui/link'

import { channelPath, formatCount } from '../lib/format'
import { useTubeT } from '../lib/strings'
import type { ChannelCard as Channel } from '../types'
import { Avatar } from './avatar'

/** A channel in a list: picture, name, handle and subscribers. */
export function ChannelCard({ channel }: { channel: Channel }) {
  const { t, lang } = useTubeT()
  const details = [channel.handle, channel.subscriber_count != null && t('subscribers', { n: formatCount(channel.subscriber_count, lang) })]
  return (
    <Link href={channelPath(channel.id)} className="flex min-h-14 items-center gap-4 rounded-xl p-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
      <Avatar url={channel.avatar_url} name={channel.name} className="size-16" />
      <div className="min-w-0">
        <p className="truncate text-lg font-medium">{channel.name}</p>
        <p className="truncate text-sm text-muted-foreground">{details.filter(Boolean).join(' · ')}</p>
      </div>
    </Link>
  )
}

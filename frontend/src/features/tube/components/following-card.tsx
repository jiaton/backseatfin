import { ListVideo } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from '@/components/ui/link'
import { QueryState } from '@/components/ui/query-state'

import { useFollow, useFollowing, useFollowPlaylist } from '../api/use-library'
import { channelPath, playlistPath } from '../lib/format'
import { useTubeT } from '../lib/strings'
import type { ChannelCard, PlaylistCard } from '../types'
import { Avatar } from './avatar'

/** Settings: every followed channel and playlist, each with Unfollow. */
export function FollowingCard() {
  const { t } = useTubeT()
  const following = useFollowing()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('followingTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <QueryState query={following}>
          {({ channels, playlists }) =>
            channels.length + playlists.length === 0 ? (
              <p className="text-muted-foreground">{t('followingEmpty')}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {channels.map((c) => <ChannelRow key={c.id} channel={c} />)}
                {playlists.map((p) => <PlaylistRow key={p.id} playlist={p} />)}
              </ul>
            )
          }
        </QueryState>
      </CardContent>
    </Card>
  )
}

function ChannelRow({ channel }: { channel: ChannelCard }) {
  const { t } = useTubeT()
  const follow = useFollow(channel.id)
  return (
    <li className="flex items-center gap-3">
      <Link href={channelPath(channel.id)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <Avatar url={channel.avatar_url} name={channel.name} />
        <span className="truncate text-base">{channel.name}</span>
      </Link>
      <Button variant="secondary" size="car" disabled={follow.isPending} onClick={() => follow.mutate(false)}>
        {t('unfollowAction')}
      </Button>
    </li>
  )
}

function PlaylistRow({ playlist }: { playlist: PlaylistCard }) {
  const { t } = useTubeT()
  const follow = useFollowPlaylist(playlist.id)
  return (
    <li className="flex items-center gap-3">
      <Link href={playlistPath(playlist.id)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-muted">
          <ListVideo aria-hidden className="size-6" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-base">{playlist.title}</span>
          {playlist.channel_name && <span className="block truncate text-sm text-muted-foreground">{playlist.channel_name}</span>}
        </span>
      </Link>
      <Button variant="secondary" size="car" disabled={follow.isPending} onClick={() => follow.mutate(false)}>
        {t('unfollowAction')}
      </Button>
    </li>
  )
}

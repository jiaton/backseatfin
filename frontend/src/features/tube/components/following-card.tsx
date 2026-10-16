import { ListVideo, Plus } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from '@/components/ui/link'
import { QueryState } from '@/components/ui/query-state'

import { NotFollowableLinkError, useFollow, useFollowing, useFollowLink, useFollowPlaylist } from '../api/use-library'
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
      <CardContent className="flex flex-col gap-4">
        <AddByLinkForm />
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

/** Paste a playlist link (the phone → car path) or a channel link, and follow it. */
function AddByLinkForm() {
  const { t } = useTubeT()
  const [url, setUrl] = useState('')
  const add = useFollowLink()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (url.trim()) add.mutate(url.trim(), { onSuccess: () => setUrl('') })
  }
  const error = add.error
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor="follow-link" className="text-sm font-medium">
        {t('addByLink')}
      </label>
      <div className="flex gap-2">
        <input
          id="follow-link"
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('addByLinkPlaceholder')}
          className="h-14 min-w-0 flex-1 rounded-xl border border-input bg-transparent px-4 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button type="submit" size="car" variant="brand" disabled={add.isPending || !url.trim()}>
          <Plus aria-hidden />
          {t('addAction')}
        </Button>
      </div>
      {add.isSuccess && (
        <p role="status" className="text-sm text-muted-foreground">
          {add.data.kind === 'playlist' ? t('addedPlaylist', { title: add.data.title }) : t('addedChannel', { title: add.data.title })}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error instanceof NotFollowableLinkError ? t('notFollowLink') : `${t('privatePlaylist')} (${error.message})`}
        </p>
      )}
    </form>
  )
}

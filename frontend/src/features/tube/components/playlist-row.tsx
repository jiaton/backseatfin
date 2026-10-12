import { ListVideo } from 'lucide-react'

import { Link } from '@/components/ui/link'

import { imageUrl, playlistPath } from '../lib/format'
import { useTubeT } from '../lib/strings'
import type { PlaylistCard } from '../types'

export function PlaylistRow({ playlist }: { playlist: PlaylistCard }) {
  const { t } = useTubeT()
  const meta = [playlist.channel_name, playlist.video_count != null && t('videoCount', { n: playlist.video_count })]
  return (
    <Link
      href={playlistPath(playlist.id)}
      className="grid grid-cols-[minmax(0,18rem)_1fr] items-start gap-4 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid-cols-[22rem_1fr]"
    >
      <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
        {playlist.thumbnail_url && <img src={imageUrl(playlist.thumbnail_url)} alt="" loading="lazy" className="size-full object-cover" />}
        <ListVideo aria-hidden className="absolute right-2 bottom-2 size-7 rounded-md bg-scrim p-1" />
      </div>
      <div className="min-w-0">
        <h3 className="line-clamp-2 text-lg font-medium">{playlist.title}</h3>
        <p className="truncate text-sm text-muted-foreground">{meta.filter(Boolean).join(' · ')}</p>
      </div>
    </Link>
  )
}

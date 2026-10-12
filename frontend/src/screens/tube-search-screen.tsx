import { QueryState } from '@/components/ui/query-state'
import { useSearch } from '@/features/tube/api/use-browse'
import { ChannelCard } from '@/features/tube/components/channel-card'
import { PlaylistRow } from '@/features/tube/components/playlist-row'
import { TubePage } from '@/features/tube/components/tube-page'
import { VideoRow } from '@/features/tube/components/video-row'
import { useTubeT } from '@/features/tube/lib/strings'
import type { SearchKind } from '@/features/tube/types'
import { navigate } from '@/lib/router'

const KINDS: SearchKind[] = ['videos', 'channels', 'playlists']

export function TubeSearchScreen({ q, kind }: { q: string; kind: SearchKind }) {
  const { t } = useTubeT()
  const results = useSearch(q, kind)
  const label = { videos: t('videos'), channels: t('channels'), playlists: t('playlists') }
  return (
    <TubePage query={q} key={q}>
      <div className="flex gap-2" role="group">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === kind}
            onClick={() => navigate(`/search?${new URLSearchParams({ q, kind: k })}`, { replace: true })}
            className="min-h-12 rounded-full bg-muted px-5 text-base outline-none aria-pressed:bg-foreground aria-pressed:text-background focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {label[k]}
          </button>
        ))}
      </div>
      <QueryState query={results}>
        {(r) => {
          const count = r.videos.length + r.channels.length + r.playlists.length
          if (!count) return <p className="text-lg text-muted-foreground">{t('noResults')}</p>
          return (
            <div className="flex max-w-5xl flex-col gap-5">
              {r.videos.map((v) => <VideoRow key={v.id} video={v} />)}
              {r.channels.map((c) => <ChannelCard key={c.id} channel={c} />)}
              {r.playlists.map((p) => <PlaylistRow key={p.id} playlist={p} />)}
            </div>
          )
        }}
      </QueryState>
    </TubePage>
  )
}

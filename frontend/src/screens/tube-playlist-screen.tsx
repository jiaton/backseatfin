import { QueryState } from '@/components/ui/query-state'
import { usePlaylist } from '@/features/tube/api/use-browse'
import { FollowPlaylistButton } from '@/features/tube/components/follow-playlist-button'
import { TubePage } from '@/features/tube/components/tube-page'
import { VideoRow } from '@/features/tube/components/video-row'
import { useTubeT } from '@/features/tube/lib/strings'

export function TubePlaylistScreen({ id }: { id: string }) {
  const { t } = useTubeT()
  const page = usePlaylist(id)
  return (
    <TubePage>
      <QueryState query={page}>
        {({ playlist, videos, following }) => (
          <div className="flex max-w-5xl flex-col gap-5">
            <div className="flex flex-wrap items-center gap-5">
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-semibold">{playlist.title}</h1>
                <p className="text-sm text-muted-foreground">
                  {[playlist.channel_name, playlist.video_count != null && t('videoCount', { n: playlist.video_count })].filter(Boolean).join(' · ')}
                </p>
              </div>
              <FollowPlaylistButton playlistId={playlist.id} following={following} />
            </div>
            <p className="text-muted-foreground">{t('playlistHint')}</p>
            {videos.map((v) => <VideoRow key={v.id} video={v} />)}
          </div>
        )}
      </QueryState>
    </TubePage>
  )
}

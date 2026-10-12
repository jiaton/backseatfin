import { QueryState } from '@/components/ui/query-state'
import { usePlaylist } from '@/features/tube/api/use-browse'
import { TubePage } from '@/features/tube/components/tube-page'
import { VideoRow } from '@/features/tube/components/video-row'
import { useTubeT } from '@/features/tube/lib/strings'

export function TubePlaylistScreen({ id }: { id: string }) {
  const { t } = useTubeT()
  const page = usePlaylist(id)
  return (
    <TubePage>
      <QueryState query={page}>
        {({ playlist, videos }) => (
          <div className="flex max-w-5xl flex-col gap-5">
            <div>
              <h1 className="text-2xl font-semibold">{playlist.title}</h1>
              <p className="text-sm text-muted-foreground">
                {[playlist.channel_name, playlist.video_count != null && t('videoCount', { n: playlist.video_count })].filter(Boolean).join(' · ')}
              </p>
            </div>
            {videos.map((v) => <VideoRow key={v.id} video={v} />)}
          </div>
        )}
      </QueryState>
    </TubePage>
  )
}

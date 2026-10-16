import { QueryState } from '@/components/ui/query-state'
import { useHome } from '@/features/tube/api/use-library'
import { TubePage } from '@/features/tube/components/tube-page'
import { VideoSection } from '@/features/tube/components/video-section'
import { playlistPath } from '@/features/tube/lib/format'
import { useTubeT } from '@/features/tube/lib/strings'

/** The car's home screen: what to pick up again, the followed playlists (filled from the
 * phone), new uploads of followed channels, recommendations, what was saved. */
export function TubeHomeScreen() {
  const { t } = useTubeT()
  const home = useHome()
  return (
    <TubePage showBack={false}>
      <QueryState query={home}>
        {(h) => {
          const empty =
            !h.continue_watching.length && !h.playlists.some((p) => p.videos.length) && !h.feed.length &&
            !h.recommended.length && !h.later.length
          return (
            <div className="flex flex-col gap-10">
              <VideoSection title={t('continueWatching')} hint={t('continueHint')} videos={h.continue_watching} />
              {h.playlists.map((p) => (
                <VideoSection key={p.playlist.id} title={p.playlist.title} href={playlistPath(p.playlist.id)} videos={p.videos} />
              ))}
              <VideoSection title={t('followingNew')} videos={h.feed} />
              <VideoSection title={t('recommended')} hint={t('recommendedHint')} videos={h.recommended} />
              <VideoSection title={t('watchLater')} videos={h.later} />
              {empty && <p className="max-w-2xl text-lg text-muted-foreground">{t('emptyHome')}</p>}
            </div>
          )
        }}
      </QueryState>
    </TubePage>
  )
}

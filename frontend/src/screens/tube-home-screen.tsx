import { QueryState } from '@/components/ui/query-state'
import { useHome } from '@/features/tube/api/use-library'
import { ChannelCard } from '@/features/tube/components/channel-card'
import { TubePage } from '@/features/tube/components/tube-page'
import { VideoSection } from '@/features/tube/components/video-section'
import { useTubeT } from '@/features/tube/lib/strings'

/** The car's home screen: what to pick up again, what's new, what was saved. */
export function TubeHomeScreen() {
  const { t } = useTubeT()
  const home = useHome()
  return (
    <TubePage showBack={false}>
      <QueryState query={home}>
        {(h) => {
          const empty = !h.continue_watching.length && !h.feed.length && !h.later.length
          return (
            <div className="flex flex-col gap-10">
              <VideoSection title={t('continueWatching')} hint={t('continueHint')} videos={h.continue_watching} />
              <VideoSection title={t('followingNew')} videos={h.feed} />
              <VideoSection title={t('watchLater')} videos={h.later} />
              {empty && <p className="max-w-2xl text-lg text-muted-foreground">{t('emptyHome')}</p>}
              {h.following.length > 0 && (
                <section className="flex flex-col gap-3">
                  <h2 className="text-xl font-semibold">{t('following')}</h2>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {h.following.map((c) => (
                      <ChannelCard key={c.id} channel={c} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )
        }}
      </QueryState>
    </TubePage>
  )
}

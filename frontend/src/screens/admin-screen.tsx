import { ArrowLeft } from 'lucide-react'

import { LanguageSwitcher } from '@/components/i18n'
import { Button } from '@/components/ui/button'
import { Link } from '@/components/ui/link'
import { LogoutButton } from '@/features/auth/components/logout-button'
import { DevicesCard } from '@/features/auth/components/devices-card'
import { ReportsCard } from '@/features/car-test/components/reports-card'
import { SourcesPanel } from '@/features/youtube/components/sources-panel'
import { VideoList } from '@/features/youtube/components/video-list'
import { useTubeT } from '@/features/tube/lib/strings'
import { useT } from '@/lib/i18n'

/** Settings: YouTube downloads to the media library, paired devices, car test reports. */
export function AdminScreen() {
  const { t } = useT()
  const tube = useTubeT().t
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild size="icon-car" variant="ghost">
            <Link href="/" aria-label={tube('home')}>
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold">{tube('settings')}</h1>
        </div>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <a href="/test" className="hover:underline">
            {t('carTestLink')}
          </a>
          <LanguageSwitcher />
          <LogoutButton />
        </nav>
      </header>
      <SourcesPanel />
      <VideoList />
      <DevicesCard />
      <ReportsCard />
    </main>
  )
}

import { LanguageSwitcher } from '@/components/i18n'
import { LogoutButton } from '@/features/auth/components/logout-button'
import { DevicesCard } from '@/features/auth/components/devices-card'
import { ReportsCard } from '@/features/car-test/components/reports-card'
import { SourcesPanel } from '@/features/youtube/components/sources-panel'
import { VideoList } from '@/features/youtube/components/video-list'
import { useT } from '@/lib/i18n'

export function AdminScreen() {
  const { t } = useT()
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">BackseatFin</h1>
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

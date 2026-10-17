import { ArrowLeft } from 'lucide-react'

import { LanguageSwitcher } from '@/components/i18n'
import { Button } from '@/components/ui/button'
import { Link } from '@/components/ui/link'
import { useSession } from '@/features/auth/api/use-session'
import { DevicesCard } from '@/features/auth/components/devices-card'
import { LogoutButton } from '@/features/auth/components/logout-button'
import { FollowingCard } from '@/features/tube/components/following-card'
import { useTubeT } from '@/features/tube/lib/strings'

/** Settings: what you follow, paired devices, language, sign out. */
export function AdminScreen() {
  const { t } = useTubeT()
  // AUTH=off: nobody signs in, so there is nothing to sign out of or pair.
  const open = useSession().data?.via === 'open'
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild size="icon-car" variant="ghost">
            <Link href="/" aria-label={t('home')}>
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold">{t('settings')}</h1>
        </div>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <LanguageSwitcher />
          {!open && <LogoutButton />}
        </nav>
      </header>
      <FollowingCard />
      {!open && <DevicesCard />}
    </main>
  )
}

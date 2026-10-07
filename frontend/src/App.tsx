import { I18nProvider } from '@/components/i18n'
import { Toaster } from '@/components/ui/sonner'
import { AuthGate } from '@/features/auth/components/auth-gate'
import { AdminScreen } from '@/screens/admin-screen'
import { CarTestScreen } from '@/screens/car-test-screen'
import { PairScreen } from '@/screens/pair-screen'

// Three flat screens don't justify a router dependency yet; add one when the car
// player screen (Phase 2) lands and routes start carrying params.
function Screen() {
  const path = window.location.pathname
  if (path.startsWith('/test')) return <CarTestScreen />
  if (path.startsWith('/pair')) return <PairScreen />
  return <AdminScreen />
}

export default function App() {
  return (
    <I18nProvider>
      <AuthGate>
        <Screen />
      </AuthGate>
      <Toaster />
    </I18nProvider>
  )
}

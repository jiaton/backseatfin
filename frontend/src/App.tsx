import { lazy, Suspense } from 'react'

import { I18nProvider } from '@/components/i18n'
import { Toaster } from '@/components/ui/sonner'
import { AuthGate } from '@/features/auth/components/auth-gate'
import type { SearchKind } from '@/features/tube/types'
import { useLocation } from '@/lib/router'
import { TubeChannelScreen } from '@/screens/tube-channel-screen'
import { TubeHomeScreen } from '@/screens/tube-home-screen'
import { TubePlaylistScreen } from '@/screens/tube-playlist-screen'
import { TubeSearchScreen } from '@/screens/tube-search-screen'
import { TubeVideoScreen } from '@/screens/tube-video-screen'

// Rarely opened in the car: loaded on demand, so the home screen loads less.
const AdminScreen = lazy(() => import('@/screens/admin-screen').then((m) => ({ default: m.AdminScreen })))
const PairScreen = lazy(() => import('@/screens/pair-screen').then((m) => ({ default: m.PairScreen })))

const KINDS: SearchKind[] = ['videos', 'channels', 'playlists']

/** Path → screen. The car player is its own page (play.html), not a route here. */
function Screen() {
  const { path, params } = useLocation()
  const [, first, second] = path.split('/').map(decodeURIComponent)
  if (first === 'pair') return <PairScreen />
  if (first === 'settings') return <AdminScreen />
  if (first === 'search') {
    const kind = KINDS.find((k) => k === params.get('kind')) ?? 'videos'
    return <TubeSearchScreen q={params.get('q') ?? ''} kind={kind} />
  }
  if (first === 'v' && second) return <TubeVideoScreen key={second} id={second} list={params.get('list') ?? undefined} />
  if (first === 'c' && second) return <TubeChannelScreen key={second} id={second} />
  if (first === 'p' && second) return <TubePlaylistScreen key={second} id={second} />
  return <TubeHomeScreen />
}

export default function App() {
  return (
    <I18nProvider>
      <AuthGate>
        <Suspense>
          <Screen />
        </Suspense>
      </AuthGate>
      <Toaster />
    </I18nProvider>
  )
}

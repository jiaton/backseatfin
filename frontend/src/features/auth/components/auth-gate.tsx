import type { ReactNode } from 'react'

import { QueryState } from '@/components/ui/query-state'

import { useSession } from '../api/use-session'
import { SignInScreen } from './sign-in-screen'

export function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession()
  return <QueryState query={session}>{(s) => (s.authenticated ? children : <SignInScreen />)}</QueryState>
}

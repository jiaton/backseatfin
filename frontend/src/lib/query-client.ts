import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'

import { ApiError, isUnauthorized } from '@/lib/api/client'

export const SESSION_KEY = ['auth', 'session'] as const

export function createQueryClient() {
  // A 401 anywhere means the device cookie was revoked or expired: re-check the session
  // so the auth gate shows sign-in, instead of every screen showing its own error.
  const onError = (error: unknown) => {
    if (isUnauthorized(error)) client.invalidateQueries({ queryKey: SESSION_KEY })
  }
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        // Don't retry 4xx: retrying a 401 only piles up entries in the fail2ban log.
        retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      },
    },
  })
  return client
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/lib/api/client'
import { SESSION_KEY } from '@/lib/query-client'

export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: () => unwrap(api.GET('/api/auth/session')),
  })
}

export function useKeyLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { key: string; name: string }) => unwrap(api.POST('/api/auth/login', { body })),
    onSuccess: (session) => qc.setQueryData(SESSION_KEY, session),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/auth/logout')),
    onSettled: () => {
      // clear() alone drops the cache without re-rendering mounted screens; flip the
      // session explicitly so the gate shows sign-in, then drop everything else.
      qc.setQueryData(SESSION_KEY, { authenticated: false })
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] || q.queryKey[1] !== SESSION_KEY[1] })
    },
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/lib/api/client'
import { SESSION_KEY } from '@/lib/query-client'

const PAIRING_START = ['auth', 'pairing', 'start'] as const

/** Starts one pairing for this screen (fresh on every mount, never cached). */
export function usePairingStart() {
  return useQuery({
    queryKey: PAIRING_START,
    queryFn: () => unwrap(api.POST('/api/auth/pairings')),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })
}

/** Polls until the phone approves (the response then sets the cookie) or it expires. */
export function usePairingStatus(pairingId: string | undefined) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['auth', 'pairing', 'status', pairingId],
    enabled: Boolean(pairingId),
    queryFn: async () => {
      const status = await unwrap(
        api.GET('/api/auth/pairings/{pairing_id}', { params: { path: { pairing_id: pairingId! } } }),
      )
      if (status.status === 'approved') await qc.invalidateQueries({ queryKey: SESSION_KEY })
      if (status.status === 'expired') await qc.refetchQueries({ queryKey: PAIRING_START })
      return status
    },
    refetchInterval: (query) => (query.state.data?.status === 'pending' || !query.state.data ? 2000 : false),
  })
}

export function useApprovePairing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { code: string; name: string }) => unwrap(api.POST('/api/auth/pairings/approve', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'devices'] }),
  })
}

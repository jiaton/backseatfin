import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/lib/api/client'

const DEVICES = ['auth', 'devices'] as const

export function useDevices() {
  return useQuery({ queryKey: DEVICES, queryFn: () => unwrap(api.GET('/api/auth/devices')) })
}

export function useRevokeDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => unwrap(api.DELETE('/api/auth/devices/{device_id}', { params: { path: { device_id: id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEVICES }),
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

export type CarReportCreate = components['schemas']['CarReportCreate']
export type CarReport = components['schemas']['CarReportOut']

const REPORTS = ['diagnostics', 'car-reports'] as const

export function useCarReports() {
  return useQuery({
    queryKey: REPORTS,
    queryFn: () => unwrap(api.GET('/api/diagnostics/car-reports', { params: { query: { limit: 20 } } })),
  })
}

export function useCreateCarReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CarReportCreate) => unwrap(api.POST('/api/diagnostics/car-reports', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: REPORTS }),
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/lib/api/client'

const SOURCES = ['youtube', 'sources'] as const
const VIDEOS = ['youtube', 'videos'] as const

export function useSources() {
  return useQuery({
    queryKey: SOURCES,
    queryFn: () => unwrap(api.GET('/api/youtube/sources')),
  })
}

function useInvalidateAll() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: SOURCES })
    qc.invalidateQueries({ queryKey: VIDEOS })
  }
}

export function useAddSource() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (url: string) => unwrap(api.POST('/api/youtube/sources', { body: { url } })),
    onSuccess: invalidate,
  })
}

export function useSetSourceEnabled() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      unwrap(api.PATCH('/api/youtube/sources/{source_id}', { params: { path: { source_id: id } }, body: { enabled } })),
    onSuccess: invalidate,
  })
}

export function useDeleteSource() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(api.DELETE('/api/youtube/sources/{source_id}', { params: { path: { source_id: id } } })),
    onSuccess: invalidate,
  })
}

export function useSyncSource() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(api.POST('/api/youtube/sources/{source_id}/sync', { params: { path: { source_id: id } } })),
    onSuccess: invalidate,
  })
}

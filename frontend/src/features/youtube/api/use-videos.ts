import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/lib/api/client'

import type { Video } from '../types'

const VIDEOS = ['youtube', 'videos'] as const
const ACTIVE: ReadonlySet<Video['status']> = new Set(['queued', 'downloading'])

export function useVideos() {
  return useQuery({
    queryKey: VIDEOS,
    queryFn: () => unwrap(api.GET('/api/youtube/videos', { params: { query: { limit: 200 } } })),
    // Poll only while something is still moving through the queue.
    refetchInterval: (query) => (query.state.data?.some((v) => ACTIVE.has(v.status)) ? 3000 : false),
  })
}

function useVideoAction(action: 'retry' | 'cancel') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => {
      const params = { params: { path: { video_id: id } } }
      return unwrap(
        action === 'retry'
          ? api.POST('/api/youtube/videos/{video_id}/retry', params)
          : api.POST('/api/youtube/videos/{video_id}/cancel', params),
      )
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: VIDEOS }),
  })
}

export const useRetryVideo = () => useVideoAction('retry')
export const useCancelVideo = () => useVideoAction('cancel')

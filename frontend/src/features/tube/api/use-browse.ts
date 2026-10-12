import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/lib/api/client'

import type { SearchKind, VideoCard } from '../types'
import { tubeKeys } from './keys'

const MINUTE = 60_000

export function useSearch(q: string, kind: SearchKind) {
  return useQuery({
    queryKey: tubeKeys.search(q, kind),
    queryFn: () => unwrap(api.GET('/api/tube/search', { params: { query: { q, kind } } })),
    enabled: q.trim().length > 0,
    staleTime: 10 * MINUTE,
  })
}

export function useVideo(id: string) {
  return useQuery({
    queryKey: tubeKeys.video(id),
    queryFn: () => unwrap(api.GET('/api/tube/videos/{video_id}', { params: { path: { video_id: id } } })),
    staleTime: 10 * MINUTE,
  })
}

/** The card a list showed for this video, if any (see tubeKeys.card). */
export function useSeededCard(id: string): VideoCard | undefined {
  return useQueryClient().getQueryData<VideoCard>(tubeKeys.card(id))
}

export function useSeedCard() {
  const qc = useQueryClient()
  return (card: VideoCard) => qc.setQueryData(tubeKeys.card(card.id), card)
}

export function useChannel(id: string | null | undefined) {
  return useQuery({
    queryKey: tubeKeys.channel(id ?? ''),
    queryFn: () => unwrap(api.GET('/api/tube/channels/{channel_id}', { params: { path: { channel_id: id! } } })),
    enabled: Boolean(id),
    staleTime: 30 * MINUTE,
  })
}

export function usePlaylist(id: string) {
  return useQuery({
    queryKey: tubeKeys.playlist(id),
    queryFn: () => unwrap(api.GET('/api/tube/playlists/{playlist_id}', { params: { path: { playlist_id: id } } })),
    staleTime: 30 * MINUTE,
  })
}

/** What a pasted YouTube link points at. */
export function useResolveLink() {
  return useMutation({
    mutationFn: (url: string) => unwrap(api.GET('/api/tube/link', { params: { query: { url } } })),
  })
}

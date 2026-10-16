import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/lib/api/client'

import { tubeKeys } from './keys'

export function useHome() {
  return useQuery({
    queryKey: tubeKeys.home,
    queryFn: () => unwrap(api.GET('/api/tube/home')),
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  // Home, channel and video pages all show follow / watch-later state.
  return () => qc.invalidateQueries({ queryKey: tubeKeys.all, predicate: (q) => q.queryKey[1] !== 'search' })
}

export function useFollow(channelId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (follow: boolean) =>
      follow
        ? unwrap(api.PUT('/api/tube/channels/{channel_id}/follow', { params: { path: { channel_id: channelId } } }))
        : unwrap(api.DELETE('/api/tube/channels/{channel_id}/follow', { params: { path: { channel_id: channelId } } })),
    onSuccess: invalidate,
  })
}

export function useFollowing() {
  return useQuery({
    queryKey: tubeKeys.following,
    queryFn: () => unwrap(api.GET('/api/tube/following')),
  })
}

export function useFollowPlaylist(playlistId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (follow: boolean) =>
      follow
        ? unwrap(api.PUT('/api/tube/playlists/{playlist_id}/follow', { params: { path: { playlist_id: playlistId } } }))
        : unwrap(api.DELETE('/api/tube/playlists/{playlist_id}/follow', { params: { path: { playlist_id: playlistId } } })),
    onSuccess: invalidate,
  })
}

export function useWatchLater(videoId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (add: boolean) =>
      add
        ? unwrap(api.PUT('/api/tube/later/{video_id}', { params: { path: { video_id: videoId } } }))
        : unwrap(api.DELETE('/api/tube/later/{video_id}', { params: { path: { video_id: videoId } } })),
    onSuccess: invalidate,
  })
}

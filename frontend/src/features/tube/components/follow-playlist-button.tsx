import { Check, House } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { useFollowPlaylist } from '../api/use-library'
import { useTubeT } from '../lib/strings'

/** Following a playlist puts it on the home screen (newest added first). */
export function FollowPlaylistButton({ playlistId, following }: { playlistId: string; following: boolean }) {
  const { t } = useTubeT()
  const follow = useFollowPlaylist(playlistId)
  return (
    <Button
      size="car"
      variant={following ? 'secondary' : 'brand'}
      aria-pressed={following}
      disabled={follow.isPending}
      onClick={() => follow.mutate(!following)}
    >
      {following ? <Check aria-hidden /> : <House aria-hidden />}
      {following ? t('followingPlaylist') : t('followPlaylist')}
    </Button>
  )
}

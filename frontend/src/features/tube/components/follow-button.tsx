import { Check, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { useFollow } from '../api/use-library'
import { useTubeT } from '../lib/strings'

export function FollowButton({ channelId, following }: { channelId: string; following: boolean }) {
  const { t } = useTubeT()
  const follow = useFollow(channelId)
  return (
    <Button
      size="car"
      variant={following ? 'secondary' : 'brand'}
      aria-pressed={following}
      disabled={follow.isPending}
      onClick={() => follow.mutate(!following)}
    >
      {following ? <Check aria-hidden /> : <Plus aria-hidden />}
      {following ? t('unfollow') : t('follow')}
    </Button>
  )
}

import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'

import { useLogout } from '../api/use-session'

export function LogoutButton() {
  const { t } = useT()
  const logout = useLogout()
  return (
    <Button variant="ghost" size="sm" disabled={logout.isPending} onClick={() => logout.mutate()}>
      {t('signOut')}
    </Button>
  )
}

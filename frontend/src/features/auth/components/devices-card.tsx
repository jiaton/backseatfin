import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { QueryState } from '@/components/ui/query-state'
import { useT } from '@/lib/i18n'

import { useDevices, useRevokeDevice } from '../api/use-devices'
import { useSession } from '../api/use-session'
import { ApprovePairingForm } from './approve-pairing-form'

export function DevicesCard() {
  const { t } = useT()
  const devices = useDevices()
  const session = useSession()
  const revoke = useRevokeDevice()
  const currentId = session.data?.device_id

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('devices')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ApprovePairingForm />
        <QueryState query={devices}>
          {(list) => (
            <ul className="divide-y">
              {list
                .filter((d) => !d.revoked_at)
                .map((d) => (
                  <li key={d.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {d.name}
                        {d.id === currentId && <span className="ml-2 text-xs text-muted-foreground">{t('thisDevice')}</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t('lastUsed', {
                          time: new Date(d.last_seen_at).toLocaleString(),
                          agent: d.user_agent || t('unknownBrowser'),
                        })}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('revokeDevice', { name: d.name })}
                      onClick={() => {
                        if (confirm(t('revokeConfirm', { name: d.name }))) revoke.mutate(d.id)
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
            </ul>
          )}
        </QueryState>
      </CardContent>
    </Card>
  )
}

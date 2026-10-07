import { LanguageSwitcher } from '@/components/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ApprovePairingForm } from '@/features/auth/components/approve-pairing-form'
import { useT } from '@/lib/i18n'

/** Where the car's QR code lands on the phone: approve with the code pre-filled. */
export function PairScreen() {
  const { t } = useT()
  const code = new URLSearchParams(window.location.search).get('code') ?? ''
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <LanguageSwitcher className="self-end" />
      <Card>
        <CardHeader>
          <CardTitle>{t('approveTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t('approveHint')}</p>
          <ApprovePairingForm initialCode={code} onApproved={() => window.location.assign('/')} />
        </CardContent>
      </Card>
    </main>
  )
}

import { QrCode } from '@/components/ui/qr-code'
import { QueryState } from '@/components/ui/query-state'
import { useT } from '@/lib/i18n'

import { usePairingStart, usePairingStatus } from '../api/use-pairing'

/** Shown on an unpaired screen (the car): a big code + QR for the phone to approve. */
export function PairingPanel() {
  const { t } = useT()
  const start = usePairingStart()
  usePairingStatus(start.data?.pairing_id)

  return (
    <QueryState query={start}>
      {(pairing) => {
        const approveUrl = `${window.location.origin}/pair?code=${pairing.code}`
        return (
          <div className="flex flex-col items-center gap-6 text-center">
            <QrCode value={approveUrl} label={t('pairQrLabel')} className="size-56 rounded-lg" />
            <p
              className="font-mono text-6xl font-semibold tracking-[0.3em]"
              aria-label={t('pairCodeLabel', { code: pairing.code.split('').join(' ') })}
            >
              {pairing.code}
            </p>
            <p className="max-w-md text-lg text-muted-foreground">
              {t('pairHint')}
            </p>
          </div>
        )
      }}
    </QueryState>
  )
}

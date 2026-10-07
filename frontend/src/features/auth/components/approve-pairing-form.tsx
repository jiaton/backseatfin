import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useT } from '@/lib/i18n'

import { useApprovePairing } from '../api/use-pairing'

export function ApprovePairingForm({ initialCode = '', onApproved }: { initialCode?: string; onApproved?: () => void }) {
  const { t } = useT()
  const [code, setCode] = useState(initialCode)
  const [name, setName] = useState('Tesla')
  const approve = useApprovePairing()

  function submit(e: FormEvent) {
    e.preventDefault()
    approve.mutate(
      { code, name: name.trim() || 'Tesla' },
      {
        onSuccess: (d) => {
          toast.success(t('approved', { name: d.name }))
          setCode('')
          onApproved?.()
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2" aria-label={t('approveFormLabel')}>
      <Input
        aria-label={t('pairCodeInput')}
        inputMode="numeric"
        pattern="\d{6}"
        maxLength={6}
        placeholder={t('pairCodePlaceholder')}
        className="w-32 font-mono"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
      />
      <Input aria-label={t('deviceName')} className="w-32" value={name} onChange={(e) => setName(e.target.value)} />
      <Button type="submit" disabled={code.length !== 6 || approve.isPending}>
        {t('approve')}
      </Button>
    </form>
  )
}

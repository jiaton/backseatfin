import { useState } from 'react'

import { LanguageSwitcher } from '@/components/i18n'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'

import { KeyLoginForm } from './key-login-form'
import { PairingPanel } from './pairing-panel'

export function SignInScreen() {
  const { t } = useT()
  const [withKey, setWithKey] = useState(false)
  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center gap-8 p-6">
      <LanguageSwitcher className="absolute top-4 right-4 h-11 px-3 text-base" />
      <h1 className="text-3xl font-semibold">BackseatFin</h1>
      {withKey ? <KeyLoginForm /> : <PairingPanel />}
      <Button variant="ghost" onClick={() => setWithKey((v) => !v)}>
        {t(withKey ? 'signInWithCode' : 'signInWithKey')}
      </Button>
    </main>
  )
}

import { type FormEvent, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useT } from '@/lib/i18n'

import { useKeyLogin } from '../api/use-session'

export function KeyLoginForm() {
  const { t } = useT()
  const [key, setKey] = useState('')
  const [name, setName] = useState(() => t('defaultPhoneName'))
  const login = useKeyLogin()

  function submit(e: FormEvent) {
    e.preventDefault()
    login.mutate({ key: key.trim(), name: name.trim() || t('defaultBrowserName') })
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="api-key">{t('apiKeyLabel')}</Label>
        <Input
          id="api-key"
          type="password"
          autoComplete="one-time-code"
          aria-describedby="setup-code-hint"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <p id="setup-code-hint" className="text-sm text-muted-foreground">
          {t('setupCodeHint')}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="device-name">{t('deviceNameLabel')}</Label>
        <Input id="device-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {login.isError && (
        <p role="alert" className="text-destructive">
          {login.error.message}
        </p>
      )}
      <Button type="submit" disabled={!key.trim() || login.isPending}>
        {t('signIn')}
      </Button>
    </form>
  )
}

import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useT } from '@/lib/i18n'

import { useAddSource } from '../api/use-sources'

export function AddSourceForm() {
  const { t } = useT()
  const [url, setUrl] = useState('')
  const add = useAddSource()

  function submit(e: FormEvent) {
    e.preventDefault()
    add.mutate(url.trim(), {
      onSuccess: (src) => {
        toast.success(t('added', { title: src.title }))
        setUrl('')
      },
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        aria-label={t('playlistUrl')}
        placeholder="https://www.youtube.com/playlist?list=…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <Button type="submit" disabled={!url.trim() || add.isPending}>
        {t(add.isPending ? 'adding' : 'add')}
      </Button>
    </form>
  )
}

import { useState } from 'react'

import { Button } from '@/components/ui/button'

import { useTubeT } from '../lib/strings'

const SHORT = 280

/** The video's description: the first few lines, the rest on request. */
export function Description({ text }: { text: string }) {
  const { t } = useTubeT()
  const [open, setOpen] = useState(false)
  if (!text.trim()) return null
  const long = text.length > SHORT
  return (
    <section className="flex flex-col items-start gap-2 rounded-xl bg-card p-4">
      <p className="text-base whitespace-pre-line text-card-foreground">{open || !long ? text : `${text.slice(0, SHORT).trimEnd()}…`}</p>
      {long && (
        <Button variant="ghost" size="car" className="-ml-3" onClick={() => setOpen(!open)}>
          {open ? t('showLess') : t('showMore')}
        </Button>
      )}
    </section>
  )
}

import { ArrowLeft, Search, Settings, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Link } from '@/components/ui/link'
import { goBack, navigate } from '@/lib/router'

import { useResolveLink } from '../api/use-browse'
import { channelPath, playlistPath, videoPath } from '../lib/format'
import { useTubeT } from '../lib/strings'

const LOOKS_LIKE_LINK = /(?:youtube\.com|youtu\.be)\//i

/** The top bar: back (or the app's name on the home screen), search, settings. Typing
 * a pasted YouTube link opens what it points at. */
export function TubeHeader({ query = '', showBack = true }: { query?: string; showBack?: boolean }) {
  const { t } = useTubeT()
  const [text, setText] = useState(query)
  const [linkError, setLinkError] = useState(false)
  const resolve = useResolveLink()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const q = text.trim()
    if (!q) return
    setLinkError(false)
    if (!LOOKS_LIKE_LINK.test(q)) {
      navigate(`/search?${new URLSearchParams({ q })}`)
      return
    }
    resolve.mutate(q, {
      onSuccess: ({ kind, id }) => navigate(kind === 'video' ? videoPath(id) : kind === 'channel' ? channelPath(id) : playlistPath(id)),
      onError: () => setLinkError(true),
    })
  }

  return (
    <header className="sticky top-0 z-10 flex flex-col gap-1 bg-background/95 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        {showBack ? (
          <Button size="icon-car" variant="ghost" aria-label={t('back')} onClick={goBack}>
            <ArrowLeft aria-hidden />
          </Button>
        ) : (
          <Link href="/" className="px-2 text-xl font-bold whitespace-nowrap">
            Backseat<span className="text-brand">Fin</span>
          </Link>
        )}
        <form role="search" onSubmit={submit} className="flex h-14 min-w-0 flex-1 items-center gap-2 rounded-full bg-muted pr-1 pl-5">
          <Search aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          <input
            id="tube-search"
            type="search"
            enterKeyHint="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('search')}
            className="h-full min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-muted-foreground"
          />
          {text && (
            <Button type="button" size="icon-lg" variant="ghost" className="rounded-full" aria-label={t('clearSearch')} onClick={() => setText('')}>
              <X aria-hidden />
            </Button>
          )}
        </form>
        <Button asChild size="icon-car" variant="ghost">
          <Link href="/settings" aria-label={t('settings')}>
            <Settings aria-hidden />
          </Link>
        </Button>
      </div>
      {resolve.isPending && <p role="status" className="px-20 text-sm text-muted-foreground">{t('openingLink')}</p>}
      {linkError && <p role="alert" className="px-20 text-sm text-destructive">{t('notLink')}</p>}
    </header>
  )
}

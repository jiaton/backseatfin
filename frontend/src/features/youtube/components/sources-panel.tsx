import { RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { QueryState } from '@/components/ui/query-state'
import { useT } from '@/lib/i18n'

import { useDeleteSource, useSetSourceEnabled, useSources, useSyncSource } from '../api/use-sources'
import type { Source } from '../types'
import { AddSourceForm } from './add-source-form'

function SourceRow({ source }: { source: Source }) {
  const { t } = useT()
  const sync = useSyncSource()
  const setEnabled = useSetSourceEnabled()
  const remove = useDeleteSource()

  return (
    <li className="flex items-center gap-3 py-2">
      <Checkbox
        aria-label={t('autoSync', { title: source.title })}
        checked={source.enabled}
        onCheckedChange={(v) => setEnabled.mutate({ id: source.id, enabled: v === true })}
      />
      <div className="min-w-0 flex-1">
        <a href={source.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
          {source.title}
        </a>
        <p className="truncate text-xs text-muted-foreground">
          {source.last_error
            ? t('syncFailed', { error: source.last_error })
            : source.last_synced_at
              ? t('syncedAt', { time: new Date(source.last_synced_at).toLocaleString() })
              : t('neverSynced')}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('syncNow', { title: source.title })}
        disabled={sync.isPending}
        onClick={() =>
          sync.mutate(source.id, {
            onSuccess: (r) => (r.error ? toast.error(r.error) : toast.success(t('newVideos', { count: r.new_videos }))),
          })
        }
      >
        <RefreshCw className={sync.isPending ? 'animate-spin' : undefined} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('deleteSource', { title: source.title })}
        onClick={() => {
          if (confirm(t('deleteSourceConfirm', { title: source.title }))) remove.mutate(source.id)
        }}
      >
        <Trash2 />
      </Button>
    </li>
  )
}

export function SourcesPanel() {
  const { t } = useT()
  const sources = useSources()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('playlists')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <AddSourceForm />
        <QueryState query={sources}>
          {(list) =>
            list.length ? (
              <ul className="divide-y">
                {list.map((s) => (
                  <SourceRow key={s.id} source={s} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('noSources')}</p>
            )
          }
        </QueryState>
      </CardContent>
    </Card>
  )
}

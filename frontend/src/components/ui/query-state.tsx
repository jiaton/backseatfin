import type { UseQueryResult } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'

import { useT } from '@/lib/i18n'

/** The one shared loading / error / not-started pattern for server-state queries. */
export function QueryState<T>({
  query,
  children,
  empty,
}: {
  query: UseQueryResult<T>
  children: (data: T) => ReactNode
  empty?: ReactNode
}) {
  const { t } = useT()
  if (query.isPending && query.fetchStatus === 'idle') {
    return empty ?? null
  }
  if (query.isPending) {
    return (
      <div role="status" aria-label={t('loadingLabel')} className="flex items-center gap-2 p-4 text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        {t('loading')}
      </div>
    )
  }
  if (query.isError) {
    return (
      <div role="alert" className="p-4 text-destructive">
        {t('error', { message: query.error.message })}
      </div>
    )
  }
  return <>{children(query.data)}</>
}

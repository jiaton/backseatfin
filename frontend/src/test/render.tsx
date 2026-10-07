import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { I18nProvider } from '@/components/i18n'
import { createQueryClient } from '@/lib/query-client'

/** Same client config as the app (incl. the global 401 → re-check session hook), and
 * the app's language provider (English under jsdom unless a test saves another). */
export function createWrapper() {
  const client = createQueryClient()
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <I18nProvider>{children}</I18nProvider>
    </QueryClientProvider>
  )
}

import type { ReactNode } from 'react'

import { TubeHeader } from './tube-header'

/** Every YouTube screen: the top bar, then the content at the car screen's width. */
export function TubePage({ children, query, showBack = true }: { children: ReactNode; query?: string; showBack?: boolean }) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[1800px] flex-col gap-6 px-4 pb-10 sm:px-6">
      <TubeHeader query={query} showBack={showBack} />
      {children}
    </div>
  )
}

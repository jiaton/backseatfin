import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/** Native <select>, styled with theme tokens. Native on purpose: the OS picker is the
 * most reliable thing to use on a car touchscreen. */
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-11 rounded-lg border border-input bg-card px-3 text-base text-card-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
      {...props}
    />
  )
}

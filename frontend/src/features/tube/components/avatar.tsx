import { cn } from '@/lib/utils'

import { imageUrl } from '../lib/format'

/** A channel's round picture, or its initial when YouTube gave none. */
export function Avatar({ url, name, className }: { url?: string | null; name: string; className?: string }) {
  return (
    <span className={cn('inline-grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-lg font-semibold', className)}>
      {url ? <img src={imageUrl(url)} alt="" loading="lazy" className="size-full object-cover" /> : name.slice(0, 1).toUpperCase()}
    </span>
  )
}

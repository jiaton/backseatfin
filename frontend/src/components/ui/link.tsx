import type { ComponentProps, MouseEvent } from 'react'

import { navigate } from '@/lib/router'

/** An in-app link: a real <a href> (long-press, new tab and screen readers work), but a
 * plain click navigates without reloading the page. */
export function Link({ href, onClick, ...props }: ComponentProps<'a'> & { href: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(href)
  }
  return <a href={href} onClick={handle} {...props} />
}

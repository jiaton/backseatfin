import { useSyncExternalStore } from 'react'

/** A tiny history router: the app's screens are a handful of paths, not worth a router
 * dependency. Navigation keeps the page (and the query cache) instead of reloading. */

const NAVIGATE = 'backseatfin:navigate'

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange)
  window.addEventListener(NAVIGATE, onChange)
  return () => {
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(NAVIGATE, onChange)
  }
}

const snapshot = () => window.location.pathname + window.location.search

/** The current path + query, re-rendering on navigation. */
export function useLocation(): { path: string; params: URLSearchParams } {
  const href = useSyncExternalStore(subscribe, snapshot)
  const url = new URL(href, window.location.origin)
  return { path: url.pathname, params: url.searchParams }
}

export function navigate(to: string, { replace = false } = {}) {
  if (to === snapshot()) return
  // `inApp`: there's a page of ours to go back to (see goBack).
  if (replace) window.history.replaceState(window.history.state, '', to)
  else window.history.pushState({ inApp: true }, '', to)
  window.scrollTo(0, 0)
  window.dispatchEvent(new Event(NAVIGATE))
}

/** Same-app paths only (a relative path, not "//host"): anything else is not followed. */
export const isAppPath = (to: string) => to.startsWith('/') && !to.startsWith('//') && !to.startsWith('/\\')

/** Back to the previous screen of ours, or home when this one was opened directly. */
export function goBack() {
  if ((window.history.state as { inApp?: boolean } | null)?.inApp) window.history.back()
  else navigate('/', { replace: true })
}

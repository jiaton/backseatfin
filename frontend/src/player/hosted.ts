import { READY_MESSAGE, SESSION_MESSAGE, type SessionCredentials } from './params'

/**
 * A player hosted on another origin than the media server (GitHub Pages) can't read the
 * server page's sessionStorage: it asks the page it's a layer in (inject.js) for the
 * viewer's session, and accepts the answer from the server's origin only.
 */
export function requestSession(serverOrigin: string, timeoutMs = 5000): Promise<SessionCredentials | null> {
  return new Promise((resolve) => {
    if (window.parent === window) return resolve(null)
    const timer = window.setTimeout(() => done(null), timeoutMs)
    function onMessage(e: MessageEvent) {
      if (e.origin !== serverOrigin || e.source !== window.parent || e.data?.type !== SESSION_MESSAGE) return
      const { token, userId } = e.data as { token?: unknown; userId?: unknown }
      done(typeof token === 'string' && typeof userId === 'string' ? { token, userId } : null)
    }
    function done(value: SessionCredentials | null) {
      window.clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      resolve(value)
    }
    window.addEventListener('message', onMessage)
    window.parent.postMessage({ type: READY_MESSAGE }, serverOrigin)
  })
}

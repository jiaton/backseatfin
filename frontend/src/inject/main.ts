/**
 * Loaded by Emby's own web page on the car host (the backend adds the <script> tag).
 * Emby stays entirely stock for browsing; the moment its player starts a video, this
 * opens the car player (/car/play) as a full-screen layer over Emby's page. The car
 * player renders on a <canvas>, which the car doesn't block while driving. Closing the
 * layer drops you back exactly where you were — Emby never reloads.
 *
 * Only Emby's main player element (class "htmlvideoplayer") triggers the hand-off —
 * never backdrop/theme videos. If Emby's session can't be read, playback is left alone.
 */

import { CLOSE_MESSAGE, isPlayerRoute, parsePlaybackUrl, playerUrl, type Handoff } from './parse'

const CREDENTIALS_KEY = 'backseatfin:emby'
const LAYER_ID = 'backseatfin-player'
// Emby's own HLS playlist request, once we've taken over, is left pending forever and
// never sent: Emby then doesn't start a server-side transcode for a video we're
// already streaming, and its player (torn down when we leave its player screen) aborts
// the request itself. Answering it instead (e.g. an empty playlist) makes Emby's
// player error out on an element that's already gone.
const heldRequests = new WeakSet<XMLHttpRequest>()

interface EmbyApiClient {
  accessToken(): string | null
  getCurrentUserId(): string | null
}

declare global {
  interface Window {
    ApiClient?: EmbyApiClient
  }
}

let lastPage = location.pathname + location.search + location.hash

function rememberPage() {
  const here = location.pathname + location.search + location.hash
  if (!isPlayerRoute(here)) lastPage = here
}
window.addEventListener('hashchange', rememberPage)
window.addEventListener('popstate', rememberPage)

const layer = () => document.getElementById(LAYER_ID)

/** Emby shows its own (now empty) player screen when Play is pressed; step back out of
 * it so the page under our layer is the one you came from. */
function leaveEmbyPlayer() {
  if (isPlayerRoute(location.href)) history.back()
}

function closeLayer() {
  layer()?.remove()
  document.documentElement.style.overflow = ''
  leaveEmbyPlayer()
}

window.addEventListener('message', (e) => {
  if (e.origin === location.origin && e.data?.type === CLOSE_MESSAGE) closeLayer()
})

function handoff(h: Handoff): boolean {
  if (layer()) return true // already playing: swallow Emby's duplicate requests
  const token = window.ApiClient?.accessToken()
  const userId = window.ApiClient?.getCurrentUserId()
  if (!token || !userId) return false
  // Same tab, same origin: the player picks the credentials up from here.
  sessionStorage.setItem(CREDENTIALS_KEY, JSON.stringify({ token, userId }))

  const frame = document.createElement('iframe')
  frame.id = LAYER_ID
  frame.src = playerUrl(h, lastPage, true)
  frame.allow = 'autoplay; fullscreen; screen-wake-lock'
  frame.setAttribute('style', 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483647')
  document.body.appendChild(frame)
  document.documentElement.style.overflow = 'hidden'
  setTimeout(leaveEmbyPlayer, 0)
  return true
}

/** Returns true when the URL was a playback URL and we took it over. */
function tryHandoff(url: unknown): boolean {
  if (typeof url !== 'string' && !(url instanceof URL)) return false
  const h = parsePlaybackUrl(String(url), location.href)
  return h ? handoff(h) : false
}

const isMainPlayer = (el: unknown) => el instanceof HTMLVideoElement && el.classList.contains('htmlvideoplayer')
const mainPlayerPresent = () => document.querySelector('video.htmlvideoplayer') !== null

// Direct play: Emby assigns videoElement.src = ".../stream.mkv?...#t=…".
const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src')
if (srcDescriptor?.set) {
  Object.defineProperty(HTMLMediaElement.prototype, 'src', {
    ...srcDescriptor,
    set(this: HTMLMediaElement, value: string) {
      if (isMainPlayer(this) && tryHandoff(value)) return
      srcDescriptor.set!.call(this, value)
    },
  })
}

const setAttribute = Element.prototype.setAttribute
Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
  if (name.toLowerCase() === 'src' && isMainPlayer(this) && tryHandoff(value)) return
  setAttribute.call(this, name, value)
}

// HLS transcode: hls.js requests master.m3u8 via XHR/fetch and plays from a blob: URL.
const xhrOpen = XMLHttpRequest.prototype.open as (this: XMLHttpRequest, ...args: unknown[]) => void
XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
  if (mainPlayerPresent() && tryHandoff(args[1])) heldRequests.add(this)
  xhrOpen.apply(this, args)
} as typeof XMLHttpRequest.prototype.open

const xhrSend = XMLHttpRequest.prototype.send
XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
  if (heldRequests.has(this)) return // stays pending until the caller aborts it
  xhrSend.call(this, body)
}

const originalFetch = window.fetch
window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
  if (mainPlayerPresent() && tryHandoff(input instanceof Request ? input.url : input)) {
    // Same as the XHR case: pending until the caller aborts.
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
    return new Promise<Response>((_, reject) =>
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
    )
  }
  return originalFetch.call(this, input, init)
}

/**
 * Loaded by the media server's own web page: Emby's on our car host (its nginx adds the
 * <script> tag), or Jellyfin's (the BackseatFin plugin adds it). The web app stays
 * entirely stock for browsing; the moment its player starts a video, this opens the car
 * player (`play`, next to this script) as a full-screen layer over the page. The car
 * player renders on a <canvas>, which the car doesn't block while driving. Closing the
 * layer drops you back exactly where you were — the page never reloads.
 *
 * Only the main player element (class "htmlvideoplayer") triggers the hand-off —
 * never backdrop/theme videos. If the session can't be read, playback is left alone.
 *
 * The Jellyfin plugin may load this in every browser (`data-mode="opt-in"` on the
 * script tag): then it only acts in browsers switched to car mode (BackseatFin/car).
 */

import { CAR_MODE_KEY, CLOSE_MESSAGE, CREDENTIALS_KEY, isActive, isPlayerRoute, parsePlaybackUrl, playerUrl, type Handoff } from './parse'

const LAYER_ID = 'backseatfin-player'
/** The player page sits next to this script: /car/play, or /BackseatFin/play. */
const PLAYER_PATH = new URL('play', import.meta.url).pathname
// The server's own HLS playlist request, once we've taken over, is left pending forever and
// never sent: the server then doesn't start a server-side transcode for a video we're
// already streaming, and its player (torn down when we leave its player screen) aborts
// the request itself. Answering it instead (e.g. an empty playlist) makes the web app's
// player error out on an element that's already gone.
const heldRequests = new WeakSet<XMLHttpRequest>()
// Playbacks already handed to the car player. The web app's player can outlive our layer
// for a while and retry its (held) playlist request; that's the same PlaySessionId and
// must not open the player again. A new Play always gets a new id.
const handedOff = new Set<string>()

interface ServerApiClient {
  accessToken(): string | null
  getCurrentUserId(): string | null
}

declare global {
  interface Window {
    ApiClient?: ServerApiClient
  }
}

function install() {
  let lastPage = location.pathname + location.search + location.hash

  function rememberPage() {
    const here = location.pathname + location.search + location.hash
    if (!isPlayerRoute(here)) lastPage = here
  }
  window.addEventListener('hashchange', rememberPage)
  window.addEventListener('popstate', rememberPage)

  const layer = () => document.getElementById(LAYER_ID)

  /** The web app shows its own (now empty) player screen when Play is pressed; step back out of
   * it so the page under our layer is the one you came from. */
  function leaveServerPlayer() {
    if (isPlayerRoute(location.href)) history.back()
  }

  function closeLayer() {
    layer()?.remove()
    document.documentElement.style.overflow = ''
    leaveServerPlayer()
  }

  window.addEventListener('message', (e) => {
    if (e.origin === location.origin && e.data?.type === CLOSE_MESSAGE) closeLayer()
  })

  function handoff(h: Handoff): boolean {
    if (layer()) return true // already playing: swallow the web app's duplicate requests
    if (h.session && handedOff.has(h.session)) return true // its player retrying: keep it held
    const token = window.ApiClient?.accessToken()
    const userId = window.ApiClient?.getCurrentUserId()
    if (!token || !userId) return false
    // Same tab, same origin: the player picks the credentials up from here.
    sessionStorage.setItem(CREDENTIALS_KEY, JSON.stringify({ token, userId }))
    if (h.session) handedOff.add(h.session)

    const frame = document.createElement('iframe')
    frame.id = LAYER_ID
    frame.src = playerUrl(h, lastPage, true, PLAYER_PATH)
    frame.allow = 'autoplay; fullscreen; screen-wake-lock'
    frame.setAttribute('style', 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483647')
    document.body.appendChild(frame)
    document.documentElement.style.overflow = 'hidden'
    setTimeout(leaveServerPlayer, 0)
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

  // Direct play: the web app assigns videoElement.src = ".../stream.mkv?...#t=…".
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
}

function readCarMode(): string | null {
  try {
    return localStorage.getItem(CAR_MODE_KEY)
  } catch {
    return null
  }
}

const script = document.querySelector<HTMLScriptElement>('script[src*="inject.js"][data-mode]')
if (isActive(script?.dataset.mode, readCarMode())) install()

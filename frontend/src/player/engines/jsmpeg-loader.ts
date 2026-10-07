/**
 * JSMpeg (MIT, vendored at public/vendor/jsmpeg.min.js) decodes MPEG-1/MP2 in JS and
 * draws onto a <canvas> — the playback path that isn't a <video> element. It isn't
 * published to npm in a maintained form, so it's loaded as a plain script, once.
 */

export interface JsmpegPlayerOptions {
  canvas: HTMLCanvasElement
  audio?: boolean
  video?: boolean
  autoplay?: boolean
  pauseWhenHidden?: boolean
  /** elapsedMs = time this frame took to decode. */
  onVideoDecode?: (decoder: unknown, elapsedMs?: number) => void
  onAudioDecode?: () => void
  onSourceEstablished?: () => void
  onSourceCompleted?: () => void
  onStalled?: () => void
  /** Seconds before the WebSocket source reconnects on close; 0 disables it (the
   * default 5 would silently restart a finished stream from its original offset). */
  reconnectInterval?: number
}

export interface JsmpegPlayer {
  destroy(): void
  volume: number
  /** Seconds of media presented since this source started. */
  currentTime: number
  /** WebAudio output; starts locked until a user gesture on most browsers. */
  audioOut?: { unlocked: boolean; unlock(callback: () => void): void }
}

interface JsmpegStatic {
  Player: new (url: string, options: JsmpegPlayerOptions) => JsmpegPlayer
  WASMModule?: { IsSupported(): boolean }
}

declare global {
  interface Window {
    JSMpeg?: JsmpegStatic
  }
}

let loading: Promise<JsmpegStatic> | null = null

export function loadJsmpeg(): Promise<JsmpegStatic> {
  if (window.JSMpeg) return Promise.resolve(window.JSMpeg)
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    // Relative to the page (base './'): /vendor/… on the admin site, /car/vendor/… on the car host.
    script.src = `${import.meta.env.BASE_URL}vendor/jsmpeg.min.js`
    script.onload = () => (window.JSMpeg ? resolve(window.JSMpeg) : reject(new Error('JSMpeg did not load')))
    script.onerror = () => {
      loading = null
      reject(new Error('failed to load vendor/jsmpeg.min.js'))
    }
    document.head.appendChild(script)
  })
  return loading
}

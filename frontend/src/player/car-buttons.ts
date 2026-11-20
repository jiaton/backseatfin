/** Optional (off by default, a switch in the settings sheet): the car's media card and its
 * play/pause button. The player has no media element (canvas + Web Audio), and a car
 * browser shows its media card only for an <audio> that is audibly playing. So this
 * plays a hidden 10 s loop of a tone nobody hears (25 Hz at −60 dBFS: an all-zero
 * file counts as silent) and puts the page's Media Session on it.
 *
 * Tested in a Tesla (Chromium 148, by muxtower): the card's button only ever sends
 * "play", whatever playbackState says, so "play" toggles. Previous/next are greyed for
 * web pages. Sound needs a tap first; after that the button works. One element for the
 * page's life (a new one per piece lost the presses). */

const KEY = 'backseatfin:car-buttons'
const RATE = 8000
const SECONDS = 10
const HZ = 25 // RATE / HZ whole samples per period: the loop joins without a click
const AMPLITUDE = Math.round(32767 * 10 ** (-60 / 20))
const SEEK_S = 10

export function loadCarButtons(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): boolean {
  try {
    return storage?.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function saveCarButtons(on: boolean, storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = globalThis.localStorage) {
  try {
    if (on) storage?.setItem(KEY, '1')
    else storage?.removeItem(KEY)
  } catch {
    // remembered for this page only
  }
}

/** The loop as a 16-bit mono WAV. */
export function toneWav(): Blob {
  const samples = RATE * SECONDS
  const buf = new ArrayBuffer(44 + samples * 2)
  const v = new DataView(buf)
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  v.setUint32(4, 36 + samples * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, RATE, true)
  v.setUint32(28, RATE * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  text(36, 'data')
  v.setUint32(40, samples * 2, true)
  for (let i = 0; i < samples; i++) v.setInt16(44 + i * 2, Math.round(AMPLITUDE * Math.sin((2 * Math.PI * HZ * i) / RATE)), true)
  return new Blob([buf], { type: 'audio/wav' })
}

const dataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })

export interface CarButtonsPlayer {
  title: string
  artist: string
  /** A picture for the card, or null. */
  artwork?: () => Promise<Blob | null>
  paused(): boolean
  play(): void
  pause(): void
  seekBy(seconds: number): void
}

export function createCarButtons(player: CarButtonsPlayer) {
  const session = globalThis.navigator?.mediaSession
  let el: HTMLAudioElement | null = null
  let on = false
  let ours = false // a pause we asked for (switching off), not the car's

  const toggle = () => (player.paused() ? player.play() : player.pause())

  function element() {
    if (el) return el
    el = document.createElement('audio')
    el.loop = true
    el.src = URL.createObjectURL(toneWav())
    // The car pausing the element itself is a press of its button too.
    el.addEventListener('pause', () => {
      if (ours || !on) return
      toggle()
      void el?.play().catch(() => {})
    })
    return el
  }

  async function describe() {
    if (!session) return
    session.metadata = new MediaMetadata({ title: player.title, artist: player.artist })
    const blob = await player.artwork?.().catch(() => null)
    // A data: URL: the browser loads it by itself, and no token goes into a URL.
    const art = blob && (await dataUrl(blob).catch(() => null))
    if (art && on) session.metadata = new MediaMetadata({ title: player.title, artist: player.artist, artwork: [{ src: art }] })
  }

  function handlers(set: boolean) {
    if (!session) return
    const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', toggle], // all the car's button sends
      ['pause', () => player.pause()],
      ['seekbackward', (d) => player.seekBy(-(d.seekOffset ?? SEEK_S))],
      ['seekforward', (d) => player.seekBy(d.seekOffset ?? SEEK_S)],
    ]
    for (const [action, handler] of actions) {
      try {
        session.setActionHandler(action, set ? handler : null)
      } catch {
        // an action this browser doesn't know
      }
    }
  }

  return {
    get on() {
      return on
    },
    /** Starts the loop. Without a tap on the page yet, the browser refuses: call again
     * from a tap. */
    async start() {
      on = true
      ours = false
      const audio = element()
      if (!audio.paused) return
      try {
        await audio.play()
      } catch {
        return // no tap yet
      }
      // Handlers once it plays: set before, the car didn't pick them up.
      handlers(true)
      this.sync()
      void describe()
    },
    stop() {
      on = false
      ours = true
      el?.pause()
      handlers(false)
      if (session) {
        session.metadata = null
        session.playbackState = 'none'
      }
    },
    /** Shows the player's state on the card. */
    sync() {
      if (on && session) session.playbackState = player.paused() ? 'paused' : 'playing'
    },
  }
}

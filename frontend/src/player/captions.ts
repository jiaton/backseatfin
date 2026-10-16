/** Text captions drawn over the picture (YouTube's: the stream itself has none burned
 * in). The page asks the source for a track's cues and this keeps the right lines on
 * screen as the clock moves. */

export interface Cue {
  start: number
  end: number
  text: string
}

const KEY = 'backseatfin:captions'
const TICK_MS = 150
// A cue YouTube gives no length still stays up this long.
const MIN_SHOW_S = 1.5
const MAX_LINES = 2

/** The lines to show at `t` (seconds): the newest cues that cover it. */
export function activeText(cues: Cue[], t: number): string {
  const lines: string[] = []
  for (const c of cues) {
    if (c.start > t) break // cues come in order
    if (t < Math.max(c.end, c.start + MIN_SHOW_S)) lines.push(c.text)
  }
  return lines.slice(-MAX_LINES).join('\n')
}

export function createCaptionLayer(now: () => number) {
  const el = document.createElement('p')
  el.className = 'cm-captions'
  el.hidden = true
  let cues: Cue[] = []
  let timer = 0
  const render = () => {
    const text = activeText(cues, now())
    if (el.textContent !== text) el.textContent = text
    el.hidden = !text
  }
  return {
    el,
    show(next: Cue[]) {
      cues = [...next].sort((a, b) => a.start - b.start)
      window.clearInterval(timer)
      timer = window.setInterval(render, TICK_MS)
      render()
    },
    clear() {
      cues = []
      window.clearInterval(timer)
      el.hidden = true
      el.textContent = ''
    },
  }
}

/** The caption language picked last (per browser), or null for off. */
export function loadCaptionLang(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): string | null {
  try {
    return storage?.getItem(KEY) || null
  } catch {
    return null
  }
}

export function saveCaptionLang(lang: string | null, storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = globalThis.localStorage) {
  try {
    if (lang) storage?.setItem(KEY, lang)
    else storage?.removeItem(KEY)
  } catch {
    // remembered for this page only
  }
}

/** Text captions drawn over the picture (YouTube's, and a media server's text subtitles:
 * the stream itself has none burned in). The page asks the source for a track's cues and this keeps the right lines on
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

const TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/
const seconds = (m: RegExpExecArray) => Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000

/** A media server's text subtitles as WebVTT or SRT → cues. Styling is dropped (tags,
 * ASS overrides such as {\an8}): the layer draws plain lines. */
export function parseSubtitles(text: string): Cue[] {
  const cues: Cue[] = []
  for (const block of text.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n')
    const at = lines.findIndex((l) => l.includes('-->'))
    if (at < 0) continue
    const [from, to] = lines[at].split('-->')
    const start = TIME.exec(from)
    const end = TIME.exec(to)
    if (!start || !end) continue
    const body = lines
      .slice(at + 1)
      .join('\n')
      .replace(/<[^>]*>|\{\\[^}]*\}/g, '')
      .replace(/\\N/g, '\n')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .trim()
    if (body) cues.push({ start: seconds(start), end: seconds(end), text: body })
  }
  return cues.sort((a, b) => a.start - b.start)
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
  const start = () => {
    window.clearInterval(timer)
    timer = window.setInterval(render, TICK_MS)
    render()
  }
  return {
    el,
    show(next: Cue[]) {
      cues = [...next].sort((a, b) => a.start - b.start)
      start()
    },
    /** More cues as the stream brings them (a cue crossing a segment boundary comes
     * twice, and a seek back fetches some again: each is kept once). */
    add(more: Cue[]) {
      const seen = new Set(cues.map((c) => `${c.start}|${c.text}`))
      const fresh = more.filter((c) => !seen.has(`${c.start}|${c.text}`))
      if (!fresh.length) return
      const wasEmpty = !cues.length
      cues = [...cues, ...fresh].sort((a, b) => a.start - b.start)
      if (wasEmpty) start()
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

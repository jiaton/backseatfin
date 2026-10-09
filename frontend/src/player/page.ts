// The player page: <car-video> under Media Chrome controls, no framework. Kept small
// on purpose — it runs in the car's browser for hours at a time. Everything that
// depends on the media server comes from a PlaybackSource (see source.ts); the entry
// points (main.ts for Emby via our server, jellyfin-main.ts) build one and mount it.
import 'media-chrome/dist/media-controller.js'
import 'media-chrome/dist/media-control-bar.js'
import 'media-chrome/dist/media-play-button.js'
import 'media-chrome/dist/media-time-range.js'
import 'media-chrome/dist/media-time-display.js'
import 'media-chrome/dist/lang/es.js'
import 'media-chrome/dist/lang/zh-CN.js'
import { setLanguage } from 'media-chrome/dist/utils/i18n.js'

import { type CarVideoError, CarVideoElement, defineCarVideo } from './car-video'
import { diagnose } from './diagnose'
import { detectLang, HTML_LANG, LANG_NAMES, type Lang, LANGS, saveLang, type StringKey, type Translate, translator } from './i18n'
import { CLOSE_MESSAGE, formatClock, type PlayerParams } from './params'
import { loadQuality, type Quality, QUALITY_HEIGHTS, QUALITY_VALUES, saveQuality } from './quality'
import type { PlaybackSource, StreamChoice, Track } from './source'
import { type Transcoder, TRANSCODERS } from './transcoder'
import './page.css'

const PROGRESS_EVERY_MS = 10_000
const SUBTITLE_POLL_MS = 3000
const AUTOHIDE_S = 3
const STATS_EVERY_MS = 500
const STATS_KEY = 'backseatfin:stats'

/** Media Chrome ships labels for some of our languages only; the rest stay English. */
const MEDIA_CHROME_LANG: Partial<Record<Lang, string>> = { zh: 'zh-CN', es: 'es' }

let lang: Lang = 'en'
let t: Translate = translator('en')
function switchLang(next: Lang) {
  lang = next
  t = translator(next)
  document.documentElement.lang = HTML_LANG[next]
  setLanguage(MEDIA_CHROME_LANG[next] ?? 'en') // Media Chrome's own labels
}
switchLang(detectLang())
defineCarVideo()

const QUALITY_NAME = { low: 'qualityLow', medium: 'qualityMedium', high: 'qualityHigh', max: 'qualityMax' } as const

/** Words for why playback stopped (car-video reports a reason, not a sentence). */
function errorText(error: CarVideoError | null): string {
  if (!error) return t('errPlayback')
  switch (error.reason) {
    case 'decode':
      return t('errDecode', { detail: error.message })
    case 'timeout':
      return t('errTimeout')
    case 'outage':
      return t('errOutage')
    case 'refused':
      if (error.closeCode === 1013) return t('errBusy')
      if (error.closeCode === 1011) return t('errServer')
      return t('errUnavailable', { detail: error.message })
  }
}

/** Tiny DOM helper: h('button', {class: 'x', 'aria-label': 'y'}, 'text', child) */
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K]
function h(tag: string, attrs?: Record<string, string>, ...children: (Node | string)[]): HTMLElement
function h(tag: string, attrs: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElement {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  el.append(...children)
  return el
}

// Inline icons (lucide paths), so the page needs no icon library.
const ICONS = {
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  rewind: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  forward: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
  settings:
    '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  volume: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/>',
}
function icon(name: keyof typeof ICONS): SVGSVGElement {
  const t = document.createElement('template')
  t.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
  return t.content.firstElementChild as SVGSVGElement
}

/** A page with just a message and the way back (nothing to play, not signed in…).
 * `root`: the server's base path, if any. */
export function showMessage(key: StringKey, server: string, vars: Record<string, string> = {}, root = '') {
  document.body.replaceChildren(
    h(
      'main',
      { class: 'cm-message' },
      h('p', {}, t(key, { server, ...vars })),
      h('a', { href: `${root}/web/` }, t('backTo', { server })),
    ),
  )
}

export interface MountOptions {
  /** Offered when the BackseatFin server could transcode instead of the media server.
   * `pick` restarts the player with the new choice at `at`. */
  transcoder?: {
    value: Transcoder
    pick(next: Transcoder, at: { t: number; audio?: number; sub?: number }): void
  }
}

const TRANSCODER_NAME = { auto: 'transcoderAuto', server: 'transcoderServer', backseatfin: 'transcoderOurs' } as const

export function mountPlayer(source: PlaybackSource, params: PlayerParams, opts: MountOptions = {}) {
  const { item, server } = source
  const defaultAudio = item.audioTracks.find((t) => t.isDefault)?.index ?? item.audioTracks[0]?.index
  const state = {
    audio: params.audio ?? defaultAudio,
    sub: params.sub,
    quality: loadQuality(),
  }

  // --- elements ----------------------------------------------------------------------
  const video = document.createElement('car-video') as CarVideoElement
  video.setAttribute('slot', 'media')
  video.engine = source.engines[0]

  const back = h('button', { class: 'cm-icon-button' }, icon('back'))
  const title = h('h1', { class: 'cm-title' }, item.title)
  const top = h('div', { slot: 'top-chrome', class: 'cm-top' }, back, title)

  const rewind = h('button', { class: 'cm-icon-button cm-round' }, icon('rewind'))
  const forward = h('button', { class: 'cm-icon-button cm-round' }, icon('forward'))
  const play = h('media-play-button', { class: 'cm-play', notooltip: '' })
  const center = h('div', { slot: 'centered-chrome', class: 'cm-center' }, rewind, play, forward)

  const settings = h('button', { class: 'cm-icon-button', 'aria-haspopup': 'dialog' }, icon('settings'))
  const bar = h(
    'media-control-bar',
    { class: 'cm-bar' },
    h('media-time-display', { showduration: '' }),
    h('media-time-range'),
    settings,
  )
  const controller = h('media-controller', { autohide: String(AUTOHIDE_S), gesturesdisabled: '', class: 'cm-controller' }, video, top, center, bar)

  const status = h('p', { class: 'cm-status', role: 'status', hidden: '' })
  const subChip = h('p', { class: 'cm-chip', role: 'status', hidden: '' })
  const unlockLabel = h('span')
  const unlock = h('button', { class: 'cm-unlock', hidden: '' }, icon('volume'), unlockLabel)
  const errorMessage = h('p')
  const retry = h('button', { class: 'cm-button cm-primary' })
  const errorBack = h('button', { class: 'cm-button' })
  const errorPanel = h('div', { class: 'cm-error', role: 'alert', hidden: '' }, errorMessage, h('div', { class: 'cm-row' }, retry, errorBack))
  const sheet = h('div', { class: 'cm-sheet', role: 'dialog', hidden: '' })
  const statsPanel = h('pre', { class: 'cm-stats', 'aria-live': 'off', hidden: '' })

  document.body.replaceChildren(controller, status, subChip, unlock, errorPanel, statsPanel, sheet)

  // Every fixed label, so the language can change without a reload.
  let subState: 'none' | 'pending' | 'failed' = 'none'
  const renderSubChip = () => {
    subChip.hidden = subState === 'none'
    subChip.classList.toggle('cm-bad', subState === 'failed')
    subChip.textContent = subState === 'failed' ? t('subtitlesFailed') : t('subtitlesLoading')
  }
  function applyTexts() {
    back.setAttribute('aria-label', t('backTo', { server }))
    rewind.setAttribute('aria-label', t('rewind'))
    forward.setAttribute('aria-label', t('forward'))
    settings.setAttribute('aria-label', t('settings'))
    sheet.setAttribute('aria-label', t('settings'))
    bar.querySelector('media-time-range')?.setAttribute('aria-label', t('progress'))
    unlockLabel.textContent = t('tapForSound')
    retry.textContent = t('retry')
    errorBack.textContent = t('back')
    if (!errorPanel.hidden) errorMessage.textContent = errorText(video.error)
    renderSubChip()
    updateStatus()
  }

  // --- stream source -----------------------------------------------------------------
  /** The player's display box in device pixels: the server never sends more than the
   * screen can show (rounded to even sizes). */
  const displayBox = () => {
    const r = video.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const even = (n: number) => Math.max(0, Math.round((n * dpr) / 2) * 2)
    return { w: even(r.width), h: even(r.height) }
  }
  const choice = (): StreamChoice => ({ ...state, box: displayBox() })
  video.source = {
    url: (start, engine) => source.streamUrl(start, engine, choice()),
    headers: source.headers,
    duration: item.duration,
    start: params.t,
  }

  // --- leaving -----------------------------------------------------------------------
  let stopped = false
  const reportStopped = (leaving: boolean) => {
    if (stopped) return
    stopped = true
    source.report('stopped', video.currentTime, choice(), { leaving })
  }
  const goBack = () => {
    // Stop fetching first: a segment request still in flight after the "stopped"
    // report would make the server start transcoding again.
    video.stop()
    reportStopped(true)
    // As a layer over the server's page: inject.js removes us (the page stays as it
    // was). Standalone: navigate back into it.
    if (params.embed && window.parent !== window) window.parent.postMessage({ type: CLOSE_MESSAGE }, window.location.origin)
    else window.location.assign(params.back)
  }
  back.addEventListener('click', goBack)
  errorBack.addEventListener('click', goBack)
  window.addEventListener('pagehide', () => reportStopped(true))

  // --- playback state → UI -----------------------------------------------------------
  let started = false
  let progressTimer = 0
  const updateStatus = () => {
    const loading = !video.paused && video.readyState < 4
    status.hidden = !loading
    if (loading) status.textContent = video.retrying ? t('reconnecting') : t('loading', { time: formatClock(video.currentTime) })
    else if (video.ended) {
      status.hidden = false
      status.textContent = t('finished')
    }
  }
  video.addEventListener('retrying', updateStatus)
  video.addEventListener('waiting', updateStatus)
  video.addEventListener('playing', () => {
    updateStatus()
    errorPanel.hidden = true
    if (!started) {
      started = true
      source.report('start', video.currentTime, choice())
    }
    window.clearInterval(progressTimer)
    progressTimer = window.setInterval(() => source.report('progress', video.currentTime, choice()), PROGRESS_EVERY_MS)
  })
  video.addEventListener('pause', () => {
    updateStatus()
    window.clearInterval(progressTimer)
    if (!video.ended && !video.error) source.report('progress', video.currentTime, choice(), { paused: true })
  })
  video.addEventListener('ended', () => {
    updateStatus()
    reportStopped(false)
  })
  video.addEventListener('error', () => {
    status.hidden = true
    errorMessage.textContent = errorText(video.error)
    errorPanel.hidden = false
  })
  video.addEventListener('audiolockchange', () => (unlock.hidden = !video.audioLocked))
  video.addEventListener('enginechange', renderSheet)
  retry.addEventListener('click', () => {
    errorPanel.hidden = true
    video.reload()
  })

  // A tap while the controls are hidden only brings them back. Without this, the click
  // that follows the tap lands on whatever button just appeared under the finger (the
  // play button sits in the middle of the screen).
  let tapWokeControls = false
  controller.addEventListener(
    'pointerdown',
    () => (tapWokeControls = controller.hasAttribute('userinactive') && !video.paused),
    { capture: true },
  )
  controller.addEventListener(
    'click',
    (e) => {
      if (!tapWokeControls) return
      tapWokeControls = false
      e.stopPropagation()
      e.preventDefault()
    },
    { capture: true },
  )

  // Any touch is a user gesture: let sound start if the browser was holding it back.
  document.addEventListener('pointerdown', () => video.unlockAudio(), { capture: true })
  unlock.addEventListener('click', () => video.unlockAudio())

  rewind.addEventListener('click', () => (video.currentTime -= 15))
  forward.addEventListener('click', () => (video.currentTime += 30))

  // --- settings sheet (quality / audio / subtitles) ----------------------------------
  const choose = (patch: Partial<typeof state>) => {
    Object.assign(state, patch)
    if (patch.quality) saveQuality(patch.quality)
    closeSheet()
    if (patch.sub !== undefined) watchSubtitle()
    video.reload()
  }
  function group(label: string, options: { label: string; detail?: string; selected: boolean; pick: () => void }[]) {
    const buttons = options.map((o) => {
      const b = h('button', { class: 'cm-option', 'aria-pressed': String(o.selected) }, o.label)
      if (o.detail) b.append(h('small', {}, o.detail))
      b.addEventListener('click', o.pick)
      return b
    })
    return h('section', {}, h('h2', {}, label), h('div', { class: 'cm-options' }, ...buttons))
  }
  /** What a level really sends in this window: its height, fitted into the display
   * box at the film's aspect ratio (known once a picture is playing). */
  function effectiveSize(levelHeight: number) {
    const box = displayBox()
    const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9
    let h = Math.min(levelHeight, box.h || levelHeight)
    let w = h * aspect
    if (box.w && w > box.w) {
      w = box.w
      h = w / aspect
    }
    return `${Math.round(w / 2) * 2}×${Math.round(h / 2) * 2}`
  }
  function renderSheet() {
    const heights = QUALITY_HEIGHTS[video.engine]
    const box = displayBox()
    const quality = group(
      t('quality'),
      QUALITY_VALUES.map((q: Quality) => ({
        label: `${t(QUALITY_NAME[q])} ${heights[q]}p`,
        detail: `≈ ${effectiveSize(heights[q])}`,
        selected: q === state.quality,
        pick: () => choose({ quality: q }),
      })),
    )
    const notes = [t('screenNote', { size: `${box.w}×${box.h}` })]
    if (video.videoWidth) notes.push(t('playingNow', { size: `${video.videoWidth}×${video.videoHeight}` }))
    quality.append(...notes.map((n) => h('p', { class: 'cm-note' }, n)))
    // The stats panel sits right here, one tap away from the quality it explains.
    const statsToggle = h('button', { class: 'cm-option cm-stats-toggle', 'aria-pressed': String(statsOn) }, t('stats'))
    statsToggle.addEventListener('click', () => {
      showStats(!statsOn)
      renderSheet()
    })
    quality.append(statsToggle)
    const groups = [quality]
    if (item.audioTracks.length > 1) {
      groups.push(
        group(
          t('audio'),
          item.audioTracks.map((tr: Track) => ({ label: tr.title, selected: tr.index === state.audio, pick: () => choose({ audio: tr.index }) })),
        ),
      )
    }
    if (item.subtitleTracks.length) {
      groups.push(
        group(t('subtitles'), [
          { label: t('off'), selected: state.sub == null, pick: () => choose({ sub: undefined }) },
          ...item.subtitleTracks.map((tr: Track) => ({ label: tr.title, selected: tr.index === state.sub, pick: () => choose({ sub: tr.index }) })),
        ]),
      )
    }
    const { transcoder } = opts
    if (transcoder) {
      const ours = source.engines[0] !== 'hls'
      const section = group(
        t('transcoder'),
        TRANSCODERS.map((v) => ({
          label: t(TRANSCODER_NAME[v], { server }),
          selected: v === transcoder.value,
          pick: () => {
            if (v === transcoder.value) return closeSheet()
            video.stop()
            reportStopped(false)
            transcoder.pick(v, { t: video.currentTime, audio: state.audio, sub: state.sub })
          },
        })),
      )
      section.append(h('p', { class: 'cm-note' }, t('transcoderNow', { name: ours ? t('transcoderOurs') : server, server })))
      groups.push(section)
    }
    // Switching language re-labels the page in place; the stream keeps playing.
    groups.push(
      group(
        t('language'),
        LANGS.map((l) => ({
          label: LANG_NAMES[l],
          selected: l === lang,
          pick: () => {
            saveLang(l)
            switchLang(l)
            applyTexts()
            renderSheet()
          },
        })),
      ),
    )
    const close = h('button', { class: 'cm-button cm-sheet-close' }, t('done'))
    close.addEventListener('click', closeSheet)
    sheet.replaceChildren(...groups, close)
  }
  function openSheet() {
    renderSheet()
    sheet.hidden = false
    controller.setAttribute('autohide', '-1') // keep the controls while choosing
  }
  function closeSheet() {
    sheet.hidden = true
    controller.setAttribute('autohide', String(AUTOHIDE_S))
  }
  settings.addEventListener('click', () => (sheet.hidden ? openSheet() : closeSheet()))

  // --- stats for nerds -----------------------------------------------------------------
  let statsOn = false
  let statsTimer = 0
  try {
    statsOn = localStorage.getItem(STATS_KEY) === '1'
  } catch {
    // storage unavailable: off
  }
  function showStats(on: boolean) {
    statsOn = on
    try {
      if (on) localStorage.setItem(STATS_KEY, '1')
      else localStorage.removeItem(STATS_KEY)
    } catch {
      // remembered for this page only
    }
    statsPanel.hidden = !on
    window.clearInterval(statsTimer)
    if (on) {
      renderStats()
      statsTimer = window.setInterval(renderStats, STATS_EVERY_MS)
    }
  }
  const ms = (v: number | undefined) => (v == null ? '–' : `${Math.round(v)} ms`)
  const signed = (v: number | undefined) => (v == null ? '–' : `${v > 0 ? '+' : ''}${Math.round(v)} ms`)
  const mbit = (kbps: number | undefined) => (kbps == null ? '–' : `${(kbps / 1000).toFixed(2)} Mbps`)
  function renderStats() {
    const s = video.stats()
    const d = diagnose({ paused: video.paused, retrying: video.retrying, started: video.readyState >= 4, stats: s })
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize
    const lines = [
      t(d.key, d.vars),
      '',
      `engine   ${s.engine} · ${s.codec || '–'} · ${s.videoWidth || 0}×${s.videoHeight || 0} · ${(s.fps ?? 0).toFixed(0)} fps`,
      `network  in ${mbit(s.receiveKbps)} · stream ${mbit(s.streamKbps)}${s.realtime != null ? ` (${s.realtime.toFixed(2)}× real time)` : ''}`,
      `buffer   ${(s.bufferAheadS ?? 0).toFixed(1)} s video · ${(s.audioBufferedS ?? 0).toFixed(1)} s audio`,
    ]
    if (s.segment != null) lines.push(`segment  #${s.segment} · server ${ms(s.segmentWaitMs)} · total ${ms(s.segmentLoadMs)}${s.segmentRetries ? ` · retried ${s.segmentRetries}` : ''}`)
    lines.push(
      `decoder  latency ${ms(s.decodeMs)} · queue ${s.decodeQueue ?? 0} · waiting ${s.chunksPending ?? 0} · late ${s.framesLate ?? 0} · skipped ${s.chunksSkipped ?? 0}${s.decoderResets ? ` · resets ${s.decoderResets}` : ''}`,
      `a/v      picture ${signed(s.avOffsetMs)} vs sound · behind clock ${ms(s.videoBehindMs)}`,
      `audio    ${s.audioFormat ?? '–'} · output latency ${ms(s.outputLatencyMs)} · clock ${s.audioClock ?? '–'}`,
      `session  ${formatClock(video.currentTime)} · ${t(QUALITY_NAME[state.quality])} ${QUALITY_HEIGHTS[video.engine][state.quality]}p · connects ${s.connects}${s.reconnects ? ` + ${s.reconnects} spliced` : ''}${s.held ? ' · server holding (buffer full)' : ''}${heap ? ` · JS ${(heap / 1048576).toFixed(1)} MB` : ''}`,
    )
    statsPanel.textContent = lines.join('\n')
  }
  if (statsOn) showStats(true)

  // --- text subtitles: extracted in the background ------------------------------------
  // Emby reads the whole file to extract an embedded subtitle (a minute on a big mkv),
  // so our server starts the stream without it; once it's ready we reconnect so it's
  // burned in. Sources that burn subtitles in by themselves have no prepareSubtitle.
  let subPoll = 0
  let subGeneration = 0
  function watchSubtitle() {
    window.clearTimeout(subPoll)
    const generation = ++subGeneration
    subState = 'none'
    renderSubChip()
    const track = item.subtitleTracks.find((tr) => tr.index === state.sub)
    const prepare = source.prepareSubtitle
    if (!track || track.kind !== 'text' || !prepare) return
    let sawPending = false
    const check = async () => {
      try {
        const result = await prepare(track.index)
        if (generation !== subGeneration) return
        if (result === 'pending') {
          sawPending = true
          subState = 'pending'
          renderSubChip()
          subPoll = window.setTimeout(check, SUBTITLE_POLL_MS)
        } else if (result === 'ready') {
          subState = 'none'
          renderSubChip()
          if (sawPending && !video.paused) video.reload()
        } else {
          subState = 'failed'
          renderSubChip()
        }
      } catch {
        if (generation === subGeneration) subPoll = window.setTimeout(check, SUBTITLE_POLL_MS)
      }
    }
    void check()
  }

  applyTexts()
  watchSubtitle()
  void video.play()
}

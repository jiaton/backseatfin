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
import { createCaptionLayer, loadCaptionLang, saveCaptionLang } from './captions'
import { createUpNext, offerNext } from './up-next'
import { diagnose } from './diagnose'
import { loadingLines } from './loading'
import { detectLang, HTML_LANG, LANG_NAMES, type Lang, LANGS, saveLang, type StringKey, type Translate, translator } from './i18n'
import { CLOSE_MESSAGE, formatClock, type PlayerParams } from './params'
import { fitLevel, gbPerHour, loadQuality, type Quality, QUALITY_VALUES, saveQuality } from './quality'
import { createHistory, createNetGraph } from './net-graph'
import { createQualityAdvisor, type QualityAdvice } from './quality-advisor'
import type { PlaybackSource, StreamChoice, Track } from './source'
import { type Transcoder, TRANSCODERS } from './transcoder'
import './page.css'

const PROGRESS_EVERY_MS = 10_000
const SUBTITLE_POLL_MS = 3000
const AUTOHIDE_S = 3
const STATS_EVERY_MS = 500
/** Quality advice: how often the network is looked at, and how long a button stays. */
/** The skip buttons: short ones stay within the buffer (≤ KEEP_BEHIND_S back, and
 * usually ahead too), long ones jump further. */
const SHORT_SKIP_S = 10
const LONG_SKIP_S = 60
const ADVICE_EVERY_MS = 2000
const ADVICE_SHOWN_MS = 20_000
/** A "lower" hint goes away (not snoozed) once playing again with this much buffered:
 * the network caught up, so it was a bad patch, not a slow link. */
const RECOVERED_AHEAD_S = 15
const STATS_KEY = 'backseatfin:stats'

/** Media Chrome ships labels for some of our languages only; the rest stay English. */
const MEDIA_CHROME_LANG: Partial<Record<Lang, string>> = { zh: 'zh-CN', es: 'es' }

let lang: Lang = 'en'
let t: Translate = translator('en')
/** The page's current language (pages built outside mountPlayer, like showMessage's). */
export const currentT = (): Translate => t
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
 * `home`: where "back" goes (the media server's web app, or our own home). */
export function showMessage(key: StringKey, server: string, vars: Record<string, string> = {}, home = '/web/') {
  const main = h(
    'main',
    { class: 'cm-message' },
    h('p', {}, t(key, { server, ...vars })),
    h('a', { href: home }, t('backTo', { server })),
  )
  document.body.replaceChildren(main)
  return main
}

export interface MountOptions {
  /** Offered when the BackseatFin server could transcode instead of the media server.
   * `pick` restarts the player with the new choice at `at`. */
  transcoder?: {
    value: Transcoder
    pick(next: Transcoder, at: { t: number; audio?: number; sub?: number }): void
  }
  /** What plays when this video ends (YouTube from a list), or null at the list's end. */
  upNext?: () => Promise<{ title: string; play(): void } | null>
}

const TRANSCODER_NAME = { auto: 'transcoderAuto', server: 'transcoderServer', backseatfin: 'transcoderOurs' } as const

/** Whether the previous history entry is `back` (then "back" can return to it instead of
 * loading it again, and the player doesn't stay in the history to come back to). */
function cameFrom(back: string): boolean {
  try {
    const ref = new URL(document.referrer)
    return ref.origin === window.location.origin && ref.pathname + ref.search === back
  } catch {
    return false
  }
}

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

  // Short skips land in what's buffered ahead or kept behind (no new stream); long ones
  // reconnect.
  const skip = (seconds: number) => {
    const button = h(
      'button',
      { class: `cm-icon-button cm-round${Math.abs(seconds) === LONG_SKIP_S ? ' cm-long' : ''}` },
      icon(seconds < 0 ? 'rewind' : 'forward'),
      h('span', { class: 'cm-skip-n', 'aria-hidden': 'true' }, String(Math.abs(seconds))),
    )
    button.addEventListener('click', () => (video.currentTime += seconds))
    return button
  }
  const skips = [-LONG_SKIP_S, -SHORT_SKIP_S, SHORT_SKIP_S, LONG_SKIP_S].map((s) => ({ s, el: skip(s) }))
  const play = h('media-play-button', { class: 'cm-play', notooltip: '' })
  const center = h('div', { slot: 'centered-chrome', class: 'cm-center' }, skips[0].el, skips[1].el, play, skips[2].el, skips[3].el)

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
  const qualityHint = h('button', { class: 'cm-hint', hidden: '' })
  const errorMessage = h('p')
  const retry = h('button', { class: 'cm-button cm-primary' })
  const errorBack = h('button', { class: 'cm-button' })
  const errorPanel = h('div', { class: 'cm-error', role: 'alert', hidden: '' }, errorMessage, h('div', { class: 'cm-row' }, retry, errorBack))
  const sheet = h('div', { class: 'cm-sheet', role: 'dialog', hidden: '' })
  const statsText = h('pre', { class: 'cm-stats-text' })
  const graph = createNetGraph()
  const statsPanel = h('div', { class: 'cm-stats', 'aria-live': 'off', hidden: '' }, graph.el, statsText)
  const loadingStage = h('p', { class: 'cm-loading-stage' })
  const loadingDetail = h('pre', { class: 'cm-loading-lines' })
  const loadingBox = h('div', { class: 'cm-loading', role: 'status', hidden: '' }, loadingStage, loadingDetail)

  const captionLayer = createCaptionLayer(() => video.currentTime)
  const upNext = createUpNext()
  document.body.replaceChildren(controller, captionLayer.el, status, loadingBox, subChip, unlock, qualityHint, errorPanel, statsPanel, upNext.el, sheet)

  // Every fixed label, so the language can change without a reload.
  let subState: 'none' | 'pending' | 'failed' = 'none'
  const renderSubChip = () => {
    subChip.hidden = subState === 'none'
    subChip.classList.toggle('cm-bad', subState === 'failed')
    subChip.textContent = subState === 'failed' ? t('subtitlesFailed') : t('subtitlesLoading')
  }
  function applyTexts() {
    back.setAttribute('aria-label', t('backTo', { server }))
    for (const { s, el } of skips) el.setAttribute('aria-label', t(s < 0 ? 'rewind' : 'forward', { n: Math.abs(s) }))
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
    reorder: source.reorder,
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
    if (params.embed && window.parent !== window) window.parent.postMessage({ type: CLOSE_MESSAGE }, params.server ?? window.location.origin)
    else if (cameFrom(params.back)) window.history.back() // the page we came from, as it was
    else window.location.replace(params.back)
  }
  back.addEventListener('click', goBack)
  errorBack.addEventListener('click', goBack)
  window.addEventListener('pagehide', () => reportStopped(true))

  // --- playback state → UI -----------------------------------------------------------
  let started = false
  let progressTimer = 0
  // While waiting for a picture: a box saying what's happening (and the numbers behind
  // a slow start), refreshed until playback runs.
  let loadingSince: number | null = null
  let loadingTimer = 0
  const renderLoading = () => {
    if (loadingSince == null) return
    const { stage, lines } = loadingLines(t, {
      stats: video.stats(),
      retrying: video.retrying,
      waited: (performance.now() - loadingSince) / 1000,
      server,
      needKbps: source.levels(video.engine)[state.quality].kbps,
      quality: `${t(QUALITY_NAME[state.quality])} · ${levelText(state.quality).split(' · ')[0]}`, // name and size
      at: formatClock(video.currentTime),
    })
    loadingStage.textContent = stage
    loadingDetail.textContent = lines.join('\n')
  }
  const updateStatus = () => {
    const loading = !video.paused && (video.readyState < 4 || video.buffering) && !video.error
    if (loading && loadingSince == null) {
      loadingSince = performance.now()
      loadingTimer = window.setInterval(renderLoading, STATS_EVERY_MS)
    } else if (!loading && loadingSince != null) {
      loadingSince = null
      window.clearInterval(loadingTimer)
    }
    loadingBox.hidden = !loading
    if (loading) renderLoading()
    status.hidden = !video.ended
    if (video.ended) status.textContent = t('finished')
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
    opts.upNext?.().then(
      (next) => next && upNext.show(t, next.title, () => { video.stop(); next.play() }),
      () => {}, // no next video known: just stop
    )
  })
  video.addEventListener('error', () => {
    status.hidden = true
    updateStatus()
    errorMessage.textContent = errorText(video.error)
    errorPanel.hidden = false
    if (opts.upNext) offerNext(errorPanel, t, opts.upNext, () => video.stop())
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


  // --- quality advice: a button, never a switch by itself ------------------------------
  // The network can't keep up → offer a lower level; once it clearly can again → offer
  // the way back (no higher than where the viewer was). Not saved as their choice.
  const advisor = createQualityAdvisor(() => source.levels(video.engine))
  let advice: QualityAdvice | null = null
  let hintTimer = 0
  const hideHint = () => {
    window.clearTimeout(hintTimer)
    advice = null
    qualityHint.hidden = true
  }
  const showHint = (a: QualityAdvice) => {
    advice = a
    qualityHint.textContent = t(a.direction === 'down' ? 'qualityAdviceDown' : 'qualityAdviceUp', { name: t(QUALITY_NAME[a.to]) })
    qualityHint.hidden = false
    window.clearTimeout(hintTimer)
    hintTimer = window.setTimeout(() => {
      advisor.snooze(a, performance.now())
      hideHint()
    }, ADVICE_SHOWN_MS)
  }
  qualityHint.addEventListener('click', () => {
    if (!advice) return
    advisor.taken(advice, state.quality)
    state.quality = advice.to
    hideHint()
    video.reload()
  })
  window.setInterval(() => {
    video.probe(advisor.probing(state.quality))
    const s = video.stats()
    if (advice?.direction === 'down' && !video.buffering && (s.bufferAheadS ?? 0) >= RECOVERED_AHEAD_S) {
      advisor.recovered(performance.now())
      hideHint()
    }
    if (video.paused || advice) return
    const next = advisor.sample(
      { at: performance.now(), buffering: video.buffering, networkKbps: s.networkKbps, networkSamples: s.networkSamples },
      state.quality,
    )
    if (next) showHint(next)
  }, ADVICE_EVERY_MS)

  // --- settings sheet (quality / audio / subtitles) ----------------------------------
  const choose = (patch: Partial<typeof state>) => {
    const burnedBefore = burnedSub(state.sub)
    Object.assign(state, patch)
    if (patch.quality) {
      saveQuality(patch.quality)
      advisor.reset()
      hideHint()
    }
    closeSheet()
    if ('sub' in patch) {
      watchSubtitle()
      if (source.captions) void showCaptions()
      if (burnedSub(state.sub) === burnedBefore) return // drawn here: same stream
    }
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
  /** What a level really sends in this window: its size cap fitted into the display
   * box at the film's aspect ratio (known once a picture is playing), and its data rate. */
  function levelText(q: Quality) {
    const l = source.levels(video.engine)[q]
    const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9
    const { w, h } = fitLevel(l, displayBox(), aspect)
    return `${w}×${h} · ${(l.kbps / 1000).toFixed(1)} Mbps · ${gbPerHour(l).toFixed(1)} GB/h`
  }
  function renderSheet() {
    const box = displayBox()
    const quality = group(
      t('quality'),
      QUALITY_VALUES.map((q: Quality) => ({
        label: t(QUALITY_NAME[q]),
        detail: levelText(q),
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
          ...item.subtitleTracks.map((tr: Track) => ({
            label: tr.auto ? t('autoCaptions', { name: tr.title }) : tr.title,
            selected: tr.index === state.sub,
            pick: () => choose({ sub: tr.index }),
          })),
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
  // The graph's history is kept while the panel is closed too (one point a second), so
  // opening it shows the last two minutes; a new stream starts it over.
  const history = createHistory()
  window.setInterval(() => {
    if (!video.paused) history.add(video.stats(), video.buffering)
  }, 1000)
  video.addEventListener('loadstart', () => history.clear())
  function renderStats() {
    const s = video.stats()
    graph.draw(history.points)
    const d = diagnose({ paused: video.paused, retrying: video.retrying, started: video.readyState >= 4, stats: s })
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize
    const lines = [
      t(d.key, d.vars),
      '',
      `engine   ${s.engine} · ${s.codec || '–'} · ${s.videoWidth || 0}×${s.videoHeight || 0} · ${(s.fps ?? 0).toFixed(0)} fps`,
      `network  in ${mbit(s.receiveKbps)} · stream ${mbit(s.streamKbps)}${s.realtime != null ? ` (${s.realtime.toFixed(2)}× real time)` : ''} · link ${mbit(s.networkKbps)}${s.rebuffers ? ` · waited for data ${s.rebuffers}×` : ''}`,
      `buffer   ${(s.bufferAheadS ?? 0).toFixed(1)} s video · ${(s.audioBufferedS ?? 0).toFixed(1)} s audio · ${(s.bufferBehindS ?? 0).toFixed(1)} s kept behind`,
    ]
    if (s.segment != null) lines.push(`segment  #${s.segment} · server ${ms(s.segmentWaitMs)} · total ${ms(s.segmentLoadMs)}${s.segmentRetries ? ` · retried ${s.segmentRetries}` : ''}`)
    lines.push(
      `decoder  latency ${ms(s.decodeMs)} · queue ${s.decodeQueue ?? 0} · waiting ${s.chunksPending ?? 0} · late ${s.framesLate ?? 0} · skipped ${s.chunksSkipped ?? 0}${s.decoderResets ? ` · resets ${s.decoderResets}` : ''}`,
      `a/v      picture ${signed(s.avOffsetMs)} vs sound · behind clock ${ms(s.videoBehindMs)}`,
      `audio    ${s.audioFormat ?? '–'} · output latency ${ms(s.outputLatencyMs)} · clock ${s.audioClock ?? '–'}`,
      `session  ${formatClock(video.currentTime)} · ${t(QUALITY_NAME[state.quality])} (${levelText(state.quality)}) · connects ${s.connects}${s.reconnects ? ` + ${s.reconnects} spliced` : ''}${s.held ? ' · server holding (buffer full)' : ''}${heap ? ` · JS ${(heap / 1048576).toFixed(1)} MB` : ''}`,
    )
    statsText.textContent = lines.join('\n')
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

  // --- captions drawn over the picture (YouTube's; a media server's text tracks) -------
  /** Drawn by the page, not burned into the stream. */
  function drawn(index: number | undefined) {
    return source.captions != null && item.subtitleTracks.find((tr) => tr.index === index)?.kind === 'text'
  }
  function burnedSub(index: number | undefined) {
    return drawn(index) ? undefined : index
  }
  let captionRequest = 0
  async function showCaptions() {
    const request = ++captionRequest
    captionLayer.clear()
    const track = item.subtitleTracks.find((tr) => tr.index === state.sub)
    // The remembered language is YouTube's (its tracks have one).
    if (item.subtitleTracks.some((tr) => tr.lang)) saveCaptionLang(track?.lang ?? null)
    subState = 'none'
    if (track && source.captions && drawn(track.index)) {
      subState = 'pending'
      renderSubChip()
      try {
        const cues = await source.captions(track.index)
        if (request !== captionRequest) return
        captionLayer.show(cues)
        subState = 'none'
      } catch {
        if (request === captionRequest) subState = 'failed'
      }
    }
    renderSubChip()
  }
  if (source.captions && state.sub == null) {
    // The language picked last time, when this video has it.
    const lang = loadCaptionLang()
    state.sub = item.subtitleTracks.find((tr) => tr.lang === lang)?.index
  }

  applyTexts()
  watchSubtitle()
  if (source.captions) void showCaptions()
  void video.play()
}

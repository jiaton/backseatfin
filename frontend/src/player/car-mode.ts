// <jellyfin>/BackseatFin/car: switches this browser into (or out of) car mode. In car
// mode, Play in Jellyfin's web app opens the BackseatFin player; other browsers keep
// Jellyfin's own player. Used when the plugin has no car-only hostname configured.
import { detectLang } from './i18n'
import { serverRoot } from './sources/mediaserver'
import './page.css'

/** Must equal inject/parse.ts CAR_MODE_KEY (a copy; car-mode.test.ts checks). */
export const CAR_MODE_KEY = 'backseatfin:car'

const TEXT = {
  en: {
    title: 'Car mode',
    explain:
      "In car mode, pressing Play in Jellyfin in this browser opens the BackseatFin player, which keeps playing while the car is moving. Other browsers aren't affected.",
    on: 'Car mode is on in this browser.',
    off: 'Car mode is off in this browser.',
    turnOn: 'Turn on',
    turnOff: 'Turn off',
    open: 'Open Jellyfin',
  },
  zh: {
    title: '车机模式',
    explain: '开启车机模式后，在这个浏览器里点 Jellyfin 的播放，会打开 BackseatFin 播放器，车辆行驶中也能继续播放。其他浏览器不受影响。',
    on: '这个浏览器已开启车机模式。',
    off: '这个浏览器未开启车机模式。',
    turnOn: '开启',
    turnOff: '关闭',
    open: '打开 Jellyfin',
  },
}

function isOn(): boolean {
  try {
    return localStorage.getItem(CAR_MODE_KEY) === '1'
  } catch {
    return false
  }
}

function set(on: boolean) {
  try {
    if (on) localStorage.setItem(CAR_MODE_KEY, '1')
    else localStorage.removeItem(CAR_MODE_KEY)
  } catch {
    // storage unavailable: car mode can't be remembered here
  }
}

function render() {
  const lang = detectLang()
  const t = TEXT[lang]
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  const on = isOn()
  const main = document.createElement('main')
  main.className = 'cm-message'
  const h1 = document.createElement('h1')
  h1.textContent = t.title
  const explain = document.createElement('p')
  explain.className = 'cm-note'
  explain.textContent = t.explain
  const state = document.createElement('p')
  state.textContent = on ? t.on : t.off
  const toggle = document.createElement('button')
  toggle.className = on ? 'cm-button' : 'cm-button cm-primary'
  toggle.textContent = on ? t.turnOff : t.turnOn
  toggle.addEventListener('click', () => {
    set(!on)
    render()
  })
  const open = document.createElement('a')
  open.href = `${serverRoot(window.location.pathname)}/web/`
  open.textContent = t.open
  main.append(h1, explain, state, toggle, open)
  document.body.replaceChildren(main)
}

render()

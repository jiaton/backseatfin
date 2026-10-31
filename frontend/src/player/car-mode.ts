// <jellyfin>/BackseatFin/car: switches this browser into (or out of) car mode. In car
// mode, Play in Jellyfin's web app opens the BackseatFin player; other browsers keep
// Jellyfin's own player. Used when the plugin has no car-only hostname configured.
import { detectLang, type Lang } from './i18n'
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
    carHost: 'This address is a car-only hostname: every browser that opens Jellyfin here gets the BackseatFin player. Nothing to switch on.',
    otherHost: "This server gives the BackseatFin player only on its car-only hostnames (set in the plugin's settings). In the car, open Jellyfin on one of those.",
    turnOn: 'Turn on',
    turnOff: 'Turn off',
    open: 'Open Jellyfin',
  },
  zh: {
    title: '车机模式',
    explain: '开启车机模式后，在这个浏览器里点 Jellyfin 的播放，会打开 BackseatFin 播放器，车辆行驶中也能继续播放。其他浏览器不受影响。',
    on: '这个浏览器已开启车机模式。',
    off: '这个浏览器未开启车机模式。',
    carHost: '这个地址是车机专用域名：在这里打开 Jellyfin 的浏览器都会用 BackseatFin 播放器，无需开启。',
    otherHost: '这台服务器只在车机专用域名上提供 BackseatFin 播放器（在插件设置里填写）。请在车上用其中一个域名打开 Jellyfin。',
    turnOn: '开启',
    turnOff: '关闭',
    open: '打开 Jellyfin',
  },
  es: {
    title: 'Modo coche',
    explain:
      'En modo coche, al pulsar Reproducir en Jellyfin en este navegador se abre el reproductor de BackseatFin, que sigue reproduciendo con el coche en marcha. Los demás navegadores no se ven afectados.',
    on: 'El modo coche está activado en este navegador.',
    off: 'El modo coche está desactivado en este navegador.',
    carHost: 'Esta dirección es un nombre de host solo para el coche: todo navegador que abra Jellyfin aquí usa el reproductor de BackseatFin. No hay nada que activar.',
    otherHost: 'Este servidor ofrece el reproductor de BackseatFin solo en sus nombres de host para el coche (definidos en los ajustes del plugin). En el coche, abre Jellyfin en uno de ellos.',
    turnOn: 'Activar',
    turnOff: 'Desactivar',
    open: 'Abrir Jellyfin',
  },
  ja: {
    title: '車載モード',
    explain:
      '車載モードでは、このブラウザで Jellyfin の再生を押すと BackseatFin プレーヤーが開き、走行中も再生が続きます。ほかのブラウザには影響しません。',
    on: 'このブラウザでは車載モードがオンです。',
    off: 'このブラウザでは車載モードがオフです。',
    carHost: 'このアドレスは車載専用のホスト名です。ここで Jellyfin を開くブラウザはすべて BackseatFin プレーヤーを使います。オンにする必要はありません。',
    otherHost: 'このサーバーは車載専用のホスト名（プラグインの設定で指定）でのみ BackseatFin プレーヤーを提供します。車ではそのいずれかで Jellyfin を開いてください。',
    turnOn: 'オンにする',
    turnOff: 'オフにする',
    open: 'Jellyfin を開く',
  },
  ko: {
    title: '차량 모드',
    explain:
      '차량 모드에서는 이 브라우저에서 Jellyfin의 재생을 누르면 BackseatFin 플레이어가 열리고, 주행 중에도 계속 재생됩니다. 다른 브라우저에는 영향이 없습니다.',
    on: '이 브라우저에서 차량 모드가 켜져 있습니다.',
    off: '이 브라우저에서 차량 모드가 꺼져 있습니다.',
    carHost: '이 주소는 차량 전용 호스트 이름입니다. 여기서 Jellyfin을 여는 모든 브라우저가 BackseatFin 플레이어를 사용합니다. 켤 필요가 없습니다.',
    otherHost: '이 서버는 차량 전용 호스트 이름(플러그인 설정에서 지정)에서만 BackseatFin 플레이어를 제공합니다. 차에서는 그중 하나로 Jellyfin을 여세요.',
    turnOn: '켜기',
    turnOff: '끄기',
    open: 'Jellyfin 열기',
  },
} satisfies Record<Lang, Record<string, string>>

/** How this address gets the car player, from the plugin (a meta tag on this page):
 * 'opt-in' = per browser (this page's switch), 'car' = a car-only hostname (always),
 * 'none' = car hostnames are set and this isn't one. */
function hostMode(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="backseatfin-host"]')?.content || 'opt-in'
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
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang
  const on = isOn()
  const main = document.createElement('main')
  main.className = 'cm-message'
  const h1 = document.createElement('h1')
  h1.textContent = t.title
  const open = document.createElement('a')
  open.href = `${serverRoot(window.location.pathname)}/web/`
  open.textContent = t.open
  const mode = hostMode()
  if (mode !== 'opt-in') {
    const state = document.createElement('p')
    state.textContent = mode === 'car' ? t.carHost : t.otherHost
    main.append(h1, state, open)
    document.body.replaceChildren(main)
    return
  }
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
  main.append(h1, explain, state, toggle, open)
  document.body.replaceChildren(main)
}

render()

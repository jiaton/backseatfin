/** Player UI strings, English and Chinese. English is the default; Chinese when the
 * browser prefers it; the viewer can switch in the settings sheet (remembered per
 * browser). Server messages stay English and technical — the page maps them to these. */
export type Lang = 'en' | 'zh'
export const LANGS: Lang[] = ['en', 'zh']
export const LANG_NAMES: Record<Lang, string> = { en: 'English', zh: '中文' }

const en = {
  back: 'Back',
  backTo: 'Back to {server}',
  rewind: 'Back 15 seconds',
  forward: 'Forward 30 seconds',
  settings: 'Quality, audio and subtitles',
  progress: 'Playback position',
  quality: 'Quality',
  audio: 'Audio',
  subtitles: 'Subtitles',
  language: 'Language',
  off: 'Off',
  done: 'Done',
  loading: 'Loading… {time}',
  reconnecting: 'Connection lost, reconnecting…',
  finished: 'Finished',
  tapForSound: 'Tap to turn on sound',
  retry: 'Retry',
  subtitlesLoading: 'Loading subtitles…',
  subtitlesFailed: "Subtitles couldn't be loaded",
  errDecode: "This browser can't decode the stream ({detail})",
  errBusy: 'All streams are busy. Try again in a moment.',
  errServer: 'The server hit an error while preparing the stream.',
  errUnavailable: "Can't play this: {detail}",
  errTimeout: 'The server took too long to send a picture.',
  errOutage: 'The connection is down and reconnecting failed.',
  errPlayback: 'Playback error',
  noItem: 'Nothing to play. Start playback from {server}.',
  signedOut: 'Not signed in, or the session expired. Press Play in {server} again.',
  loadFailed: "Couldn't load: {detail}",
  screenNote:
    'This window can show up to {size}. The stream is never sent larger than that, so above it a higher level only raises the bitrate: a little more detail, more data.',
  playingNow: 'Playing now: {size}',
  qualityLow: 'Low',
  qualityMedium: 'Standard',
  qualityHigh: 'High',
  qualityMax: 'Max',
}
export type StringKey = keyof typeof en

const zh: Record<StringKey, string> = {
  back: '返回',
  backTo: '返回 {server}',
  rewind: '后退 15 秒',
  forward: '前进 30 秒',
  settings: '画质、音轨和字幕',
  progress: '播放进度',
  quality: '画质',
  audio: '音轨',
  subtitles: '字幕',
  language: '语言',
  off: '关闭',
  done: '完成',
  loading: '加载中… {time}',
  reconnecting: '网络中断，正在重连…',
  finished: '播放完毕',
  tapForSound: '点一下开启声音',
  retry: '重试',
  subtitlesLoading: '字幕加载中…',
  subtitlesFailed: '字幕加载失败',
  errDecode: '这个浏览器无法解码视频（{detail}）',
  errBusy: '同时播放的路数已满，请稍后再试。',
  errServer: '服务器准备视频时出错。',
  errUnavailable: '无法播放：{detail}',
  errTimeout: '加载超时，服务器迟迟没有返回画面。',
  errOutage: '网络中断，重连失败。',
  errPlayback: '播放出错',
  noItem: '缺少要播放的内容，请从 {server} 点播放。',
  signedOut: '没有登录信息或已过期，请在 {server} 里重新点播放。',
  loadFailed: '无法加载：{detail}',
  screenNote: '这个窗口最多显示 {size}。视频不会以超过这个尺寸传输，所以再往上选更高档位，只是提高码率：细节多一点，流量也更大。',
  playingNow: '当前播放：{size}',
  qualityLow: '流畅',
  qualityMedium: '标清',
  qualityHigh: '高清',
  qualityMax: '超清',
}

const TABLES: Record<Lang, Record<StringKey, string>> = { en, zh }
const KEY = 'backseatfin:lang'

const isLang = (v: unknown): v is Lang => v === 'en' || v === 'zh'

/** The saved choice, else the first browser language we have, else English. */
export function detectLang(
  storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage,
  languages: readonly string[] = globalThis.navigator?.languages ?? [],
): Lang {
  try {
    const saved = storage?.getItem(KEY)
    if (isLang(saved)) return saved
  } catch {
    // storage unavailable: fall through to the browser's languages
  }
  for (const l of languages) {
    const base = l.toLowerCase().split('-')[0]
    if (isLang(base)) return base
  }
  return 'en'
}

export function saveLang(lang: Lang, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, lang)
  } catch {
    // unavailable storage: the choice lasts for this page only
  }
}

export type Translate = (key: StringKey, vars?: Record<string, string | number>) => string

export function translator(lang: Lang): Translate {
  const table = TABLES[lang]
  return (key, vars = {}) => table[key].replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
}

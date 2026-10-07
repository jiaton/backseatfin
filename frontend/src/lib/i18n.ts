import { createContext, useContext } from 'react'

import type { Lang } from '@/player/i18n'

/** Admin UI strings (admin, /pair, /test), English and Chinese. Language detection and
 * the saved choice are the player's (`@/player/i18n`), so both pages stay in step. */
const en = {
  // shared
  language: 'Language',
  loading: 'Loading…',
  loadingLabel: 'Loading',
  error: 'Something went wrong: {message}',
  play: 'Play',
  stop: 'Stop',
  yes: 'Yes',
  no: 'No',

  // admin header
  carTestLink: 'Car test page →',
  signOut: 'Sign out',

  // sign-in and pairing
  signInWithCode: 'Sign in with a pairing code',
  signInWithKey: 'Sign in with an API key',
  apiKeyLabel: 'API key (API_KEY in backend/.env)',
  deviceNameLabel: 'Name this device',
  defaultPhoneName: 'Phone',
  defaultBrowserName: 'Browser',
  signIn: 'Sign in',
  pairQrLabel: 'Scan with your phone to approve this device',
  pairCodeLabel: 'Pairing code {code}',
  pairHint:
    'Scan with a phone that is signed in, or enter these 6 digits under Devices on the admin page. This screen signs in by itself once approved.',
  approveTitle: 'Approve a new device',
  approveHint: 'Check that the car shows this pairing code, then tap Approve.',
  approveFormLabel: 'Approve a new device',
  pairCodeInput: '6-digit pairing code',
  pairCodePlaceholder: 'Pairing code',
  deviceName: 'Device name',
  approve: 'Approve',
  approved: 'Approved “{name}”. It will sign in within a few seconds.',

  // devices
  devices: 'Devices',
  thisDevice: '(this device)',
  lastUsed: 'Last used {time} · {agent}',
  unknownBrowser: 'Unknown browser',
  revokeDevice: 'Remove {name}',
  revokeConfirm: 'Remove “{name}”? It will need to pair again.',

  // YouTube playlists and queue
  playlists: 'YouTube playlists',
  playlistUrl: 'YouTube playlist link',
  add: 'Add',
  adding: 'Checking…',
  added: 'Added “{title}”',
  autoSync: 'Sync {title} automatically',
  syncFailed: 'Last sync failed: {error}',
  syncedAt: 'Last synced {time}',
  neverSynced: 'Not synced yet',
  syncNow: 'Sync {title} now',
  newVideos: 'New videos: {count}',
  deleteSource: 'Remove playlist {title}',
  deleteSourceConfirm: 'Remove the playlist “{title}”? Videos already downloaded are kept.',
  noSources:
    'No playlists yet. Paste the link of an unlisted playlist and its videos will download into Emby automatically.',
  queue: 'Download queue',
  queueEmpty: 'The queue is empty.',
  retryVideo: 'Retry {title}',
  cancelVideo: 'Cancel {title}',
  statusQueued: 'Queued',
  statusDownloading: 'Downloading',
  statusDone: 'In library',
  statusFailed: 'Failed',
  statusCancelled: 'Cancelled',
  statusInterrupted: 'Interrupted',

  // car test page
  carTestTitle: 'Car playback test',
  uaHasTesla: 'The user agent mentions “Tesla”',
  uaNoTesla: 'The user agent does not mention “Tesla”',
  canvasProbe: 'Canvas playback test',
  canvasHeading: '① Canvas (JSMpeg, MPEG-1 decoded in software)',
  jsmpegResolution: 'JSMpeg resolution',
  connected: 'Connected',
  notConnected: 'Not connected',
  canvasStats: '{state} · video {fps} fps · audio {audio}/s · decode {ms} ms/frame (about {load}% of the budget)',
  canvasHint:
    'You should see color bars and a running counter, and hear a 440 Hz beep, at about 30 fps. Decode time near 33 ms/frame means the car is at its limit.',
  decodedWithWasm: 'Decoding with WebAssembly.',
  decodedWithJs: 'Decoding with plain JavaScript.',
  webcodecsProbe: 'WebCodecs hardware decoding test',
  webcodecsHeading: '② H.264 hardware decoding (WebCodecs)',
  webcodecsSupport: 'WebCodecs {api} · hardware decoding {hw} · software decoding {sw}',
  detecting: 'Checking…',
  webcodecsResolution: 'WebCodecs resolution',
  webcodecsStats: '{size} · {fps} fps · decode latency {ms} ms · queue {queue}',
  decodeError: 'Decode error: {message}',
  wsFailed: 'WebSocket connection failed',
  webcodecsHint:
    'No sound is expected (this tests video only). You should see color bars and a running counter at about 30 fps. Lower decode latency is better.',
  videoProbe: 'Video element control test',
  videoHeading: '③ Plain <video> (control)',
  videoEvents: 'Video element events',
  reportFormLabel: 'Test results',
  reportHeading: '④ Record the results',
  qMoving: 'Is the car driving (in D and moving)?',
  qCanvasVideo: '① Does Canvas show moving video?',
  qCanvasAudio: '① Does Canvas play sound?',
  qWebcodecsVideo: '② Does WebCodecs show moving video?',
  qVideoTag: '③ Does the plain video play?',
  notes: 'Notes',
  notesPlaceholder: 'Notes (optional)',
  submitReport: 'Submit (also records the browser user agent and the numbers measured above)',
  reportSaved: 'Saved, thanks!',
  reportsTitle: 'Car test reports',
  reportLine: '{time} · driving {moving} · canvas video {canvasVideo} audio {canvasAudio} · WebCodecs {webcodecs} · video {videoTag}',
  noReports: 'No reports yet. Open the {path} page in the car, run the tests and submit.',
} as const
export type Key = keyof typeof en

const zh: Record<Key, string> = {
  language: '语言',
  loading: '加载中…',
  loadingLabel: '加载中',
  error: '出错了：{message}',
  play: '开始播放',
  stop: '停止',
  yes: '是',
  no: '否',

  carTestLink: '车机测试页 →',
  signOut: '退出登录',

  signInWithCode: '用配对码登录',
  signInWithKey: '用 API Key 登录',
  apiKeyLabel: 'API Key（backend/.env 里的 API_KEY）',
  deviceNameLabel: '这台设备叫',
  defaultPhoneName: '手机',
  defaultBrowserName: '浏览器',
  signIn: '登录',
  pairQrLabel: '用手机扫码批准这台设备',
  pairCodeLabel: '配对码 {code}',
  pairHint: '用已登录的手机扫码，或在管理页「设备」里输入这 6 位数字。批准后这里会自动登录。',
  approveTitle: '批准新设备登录',
  approveHint: '确认车上显示的是这个配对码，再点批准。',
  approveFormLabel: '批准新设备',
  pairCodeInput: '6 位配对码',
  pairCodePlaceholder: '配对码',
  deviceName: '设备名',
  approve: '批准',
  approved: '已批准「{name}」，那台设备几秒内会自动登录',

  devices: '设备',
  thisDevice: '（当前）',
  lastUsed: '最近使用 {time} · {agent}',
  unknownBrowser: '未知浏览器',
  revokeDevice: '注销 {name}',
  revokeConfirm: '注销「{name}」？它需要重新配对。',

  playlists: 'YouTube 播放列表',
  playlistUrl: 'YouTube 播放列表链接',
  add: '添加',
  adding: '读取中…',
  added: '已添加「{title}」',
  autoSync: '自动同步 {title}',
  syncFailed: '上次同步失败：{error}',
  syncedAt: '上次同步 {time}',
  neverSynced: '尚未同步',
  syncNow: '立即同步 {title}',
  newVideos: '新增 {count} 个视频',
  deleteSource: '删除来源 {title}',
  deleteSourceConfirm: '删除来源「{title}」？已下载的视频会保留。',
  noSources: '还没有来源。把一个「不公开」播放列表的链接贴进来，列表里的视频会自动下载进 Emby。',
  queue: '下载队列',
  queueEmpty: '队列是空的。',
  retryVideo: '重试 {title}',
  cancelVideo: '取消 {title}',
  statusQueued: '排队中',
  statusDownloading: '下载中',
  statusDone: '已入库',
  statusFailed: '失败',
  statusCancelled: '已取消',
  statusInterrupted: '中断',

  carTestTitle: '车机播放测试',
  uaHasTesla: 'UA 里有 “Tesla” 字样',
  uaNoTesla: 'UA 里没有 “Tesla” 字样',
  canvasProbe: 'Canvas 播放测试',
  canvasHeading: '① Canvas（JSMpeg，MPEG-1 软件解码）',
  jsmpegResolution: 'JSMpeg 分辨率',
  connected: '已连接',
  notConnected: '未连接',
  canvasStats: '{state} · 画面 {fps} fps · 声音 {audio}/s · 解码 {ms} ms/帧（约 {load}% 算力）',
  canvasHint: '正常应看到彩条、跳动的计数器，听到 440Hz 的“嘟”声，约 30 fps。解码 ms/帧 接近 33 说明车机已到极限。',
  decodedWithWasm: '解码方式：WebAssembly。',
  decodedWithJs: '解码方式：纯 JavaScript。',
  webcodecsProbe: 'WebCodecs 硬件解码测试',
  webcodecsHeading: '② H.264 硬件解码（WebCodecs）',
  webcodecsSupport: '支持 WebCodecs {api} · 硬件解码 {hw} · 软件解码 {sw}',
  detecting: '检测中…',
  webcodecsResolution: 'WebCodecs 分辨率',
  webcodecsStats: '{size} · {fps} fps · 解码延迟 {ms} ms · 队列 {queue}',
  decodeError: '解码出错：{message}',
  wsFailed: 'WebSocket 连接失败',
  webcodecsHint: '没有声音是正常的（只测画面）。正常应看到彩条和跳动的计数器，约 30 fps，解码延迟越低越好。',
  videoProbe: 'Video 标签对照测试',
  videoHeading: '③ 普通 <video>（对照组）',
  videoEvents: 'video 事件记录',
  reportFormLabel: '测试结果',
  reportHeading: '④ 记录结果',
  qMoving: '车在行驶中（D 挡、在动）？',
  qCanvasVideo: '① Canvas 有画面且在动？',
  qCanvasAudio: '① Canvas 有声音？',
  qWebcodecsVideo: '② WebCodecs 有画面且在动？',
  qVideoTag: '③ 普通 video 能播？',
  notes: '备注',
  notesPlaceholder: '备注（可选）',
  submitReport: '提交（会一并记录浏览器 UA 和上面测到的数据）',
  reportSaved: '已记录，谢谢！',
  reportsTitle: '车机测试记录',
  reportLine: '{time} · 行驶 {moving} · canvas 画面 {canvasVideo} 声音 {canvasAudio} · WebCodecs {webcodecs} · video {videoTag}',
  noReports: '还没有记录。在车上打开 {path} 页面测试后提交。',
}

export const TABLES: Record<Lang, Record<Key, string>> = { en, zh }

export type T = (key: Key, vars?: Record<string, string | number>) => string

/** Unknown `{vars}` are left as written, so a caller can split on them (see ReportsCard). */
export function translate(lang: Lang): T {
  const table = TABLES[lang]
  return (key, vars = {}) => table[key].replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
}

export interface I18n {
  lang: Lang
  t: T
  setLang: (lang: Lang) => void
}

// Outside a provider (some unit tests) components get English and a no-op switch.
export const I18nContext = createContext<I18n>({ lang: 'en', t: translate('en'), setLang: () => {} })

export function useT(): I18n {
  return useContext(I18nContext)
}

import { createContext, useContext } from 'react'

import type { Lang } from '@/player/i18n'

/** Admin UI strings (admin, /pair, /test) in every player language (English first, the source
 * of truth; then Chinese, Spanish, Japanese, Korean). Language detection and
 * the saved choice are the player's (`@/player/i18n`), so both pages stay in step. */
const en = {
  // shared
  language: 'Language',
  loading: 'Loading…',
  loadingLabel: 'Loading',
  error: 'Something went wrong: {message}',
  play: 'Play',

  // admin header
  signOut: 'Sign out',

  // sign-in and pairing
  signInWithCode: 'Sign in with a pairing code',
  signInWithKey: 'Sign in with a setup code',
  apiKeyLabel: 'Setup code (or API key)',
  setupCodeHint:
    'The server prints a code in its log at the first start (docker compose logs backend). For a new one, run: docker compose exec backend backseatfin-code',
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
  added: 'Added “{title}”',
  newVideos: 'New videos: {count}',

  // car test page
  noReports: 'No reports yet. Open the {path} page in the car, run the tests and submit.',
} as const
export type Key = keyof typeof en

const zh: Record<Key, string> = {
  language: '语言',
  loading: '加载中…',
  loadingLabel: '加载中',
  error: '出错了：{message}',
  play: '开始播放',

  signOut: '退出登录',

  signInWithCode: '用配对码登录',
  signInWithKey: '用设置码登录',
  apiKeyLabel: '设置码（或 API Key）',
  setupCodeHint: '服务器第一次启动时会在日志里打印一个设置码（docker compose logs backend）。要新的，运行：docker compose exec backend backseatfin-code',
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
  added: '已添加「{title}」',
  newVideos: '新增 {count} 个视频',

  noReports: '还没有记录。在车上打开 {path} 页面测试后提交。',
}

const es: Record<Key, string> = {
  language: 'Idioma',
  loading: 'Cargando…',
  loadingLabel: 'Cargando',
  error: 'Algo salió mal: {message}',
  play: 'Reproducir',

  signOut: 'Cerrar sesión',

  signInWithCode: 'Iniciar sesión con un código de emparejamiento',
  signInWithKey: 'Iniciar sesión con un código de configuración',
  apiKeyLabel: 'Código de configuración (o clave de API)',
  setupCodeHint:
    'El servidor escribe un código en su registro al arrancar por primera vez (docker compose logs backend). Para uno nuevo, ejecuta: docker compose exec backend backseatfin-code',
  deviceNameLabel: 'Nombre de este dispositivo',
  defaultPhoneName: 'Teléfono',
  defaultBrowserName: 'Navegador',
  signIn: 'Iniciar sesión',
  pairQrLabel: 'Escanéalo con tu teléfono para aprobar este dispositivo',
  pairCodeLabel: 'Código de emparejamiento {code}',
  pairHint:
    'Escanéalo con un teléfono que tenga la sesión iniciada, o introduce estos 6 dígitos en Dispositivos, en la página de administración. Esta pantalla iniciará sesión sola cuando lo apruebes.',
  approveTitle: 'Aprobar un dispositivo nuevo',
  approveHint: 'Comprueba que el coche muestra este código de emparejamiento y toca Aprobar.',
  approveFormLabel: 'Aprobar un dispositivo nuevo',
  pairCodeInput: 'Código de emparejamiento de 6 dígitos',
  pairCodePlaceholder: 'Código de emparejamiento',
  deviceName: 'Nombre del dispositivo',
  approve: 'Aprobar',
  approved: '“{name}” aprobado. Iniciará sesión en unos segundos.',

  devices: 'Dispositivos',
  thisDevice: '(este dispositivo)',
  lastUsed: 'Último uso {time} · {agent}',
  unknownBrowser: 'Navegador desconocido',
  revokeDevice: 'Quitar {name}',
  revokeConfirm: '¿Quitar “{name}”? Tendrá que emparejarse de nuevo.',

  playlists: 'Listas de YouTube',
  added: '“{title}” añadida',
  newVideos: 'Vídeos nuevos: {count}',

  noReports: 'Aún no hay informes. Abre la página {path} en el coche, haz las pruebas y envíalas.',
}

const ja: Record<Key, string> = {
  language: '言語',
  loading: '読み込み中…',
  loadingLabel: '読み込み中',
  error: 'エラーが発生しました: {message}',
  play: '再生',

  signOut: 'ログアウト',

  signInWithCode: 'ペアリングコードでログイン',
  signInWithKey: 'セットアップコードでログイン',
  apiKeyLabel: 'セットアップコード（または API キー）',
  setupCodeHint:
    'サーバーは初回起動時にコードをログに出します（docker compose logs backend）。新しいコードは docker compose exec backend backseatfin-code で発行できます。',
  deviceNameLabel: 'このデバイスの名前',
  defaultPhoneName: 'スマートフォン',
  defaultBrowserName: 'ブラウザ',
  signIn: 'ログイン',
  pairQrLabel: 'スマートフォンでスキャンしてこのデバイスを承認',
  pairCodeLabel: 'ペアリングコード {code}',
  pairHint:
    'ログイン済みのスマートフォンでスキャンするか、管理ページの「デバイス」でこの 6 桁の数字を入力してください。承認されるとこの画面は自動でログインします。',
  approveTitle: '新しいデバイスを承認',
  approveHint: '車にこのペアリングコードが表示されていることを確認してから、「承認」をタップしてください。',
  approveFormLabel: '新しいデバイスを承認',
  pairCodeInput: '6 桁のペアリングコード',
  pairCodePlaceholder: 'ペアリングコード',
  deviceName: 'デバイス名',
  approve: '承認',
  approved: '「{name}」を承認しました。数秒以内にログインします。',

  devices: 'デバイス',
  thisDevice: '（このデバイス）',
  lastUsed: '最終使用 {time} · {agent}',
  unknownBrowser: '不明なブラウザ',
  revokeDevice: '{name} を削除',
  revokeConfirm: '「{name}」を削除しますか？再度ペアリングが必要になります。',

  playlists: 'YouTube プレイリスト',
  added: '「{title}」を追加しました',
  newVideos: '新しい動画: {count} 本',

  noReports: 'レポートはまだありません。車で {path} ページを開き、テストを実行して送信してください。',
}

const ko: Record<Key, string> = {
  language: '언어',
  loading: '불러오는 중…',
  loadingLabel: '불러오는 중',
  error: '문제가 발생했어요: {message}',
  play: '재생',

  signOut: '로그아웃',

  signInWithCode: '페어링 코드로 로그인',
  signInWithKey: '설정 코드로 로그인',
  apiKeyLabel: '설정 코드 (또는 API 키)',
  setupCodeHint:
    '서버가 처음 시작할 때 로그에 코드를 출력합니다 (docker compose logs backend). 새 코드: docker compose exec backend backseatfin-code',
  deviceNameLabel: '이 기기의 이름',
  defaultPhoneName: '휴대폰',
  defaultBrowserName: '브라우저',
  signIn: '로그인',
  pairQrLabel: '휴대폰으로 스캔해 이 기기를 승인하세요',
  pairCodeLabel: '페어링 코드 {code}',
  pairHint:
    '로그인된 휴대폰으로 스캔하거나, 관리 페이지의 기기 메뉴에서 이 6자리 숫자를 입력하세요. 승인되면 이 화면이 자동으로 로그인해요.',
  approveTitle: '새 기기 승인',
  approveHint: '차량에 이 페어링 코드가 표시되는지 확인한 다음 승인을 누르세요.',
  approveFormLabel: '새 기기 승인',
  pairCodeInput: '6자리 페어링 코드',
  pairCodePlaceholder: '페어링 코드',
  deviceName: '기기 이름',
  approve: '승인',
  approved: '“{name}”을(를) 승인했어요. 몇 초 안에 로그인돼요.',

  devices: '기기',
  thisDevice: '(이 기기)',
  lastUsed: '마지막 사용 {time} · {agent}',
  unknownBrowser: '알 수 없는 브라우저',
  revokeDevice: '{name} 삭제',
  revokeConfirm: '“{name}”을(를) 삭제할까요? 다시 페어링해야 해요.',

  playlists: 'YouTube 재생목록',
  added: '“{title}”을(를) 추가했어요',
  newVideos: '새 동영상: {count}개',

  noReports: '아직 보고서가 없어요. 차량에서 {path} 페이지를 열고 테스트한 다음 제출하세요.',
}

export const TABLES: Record<Lang, Record<Key, string>> = { en, zh, es, ja, ko }

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

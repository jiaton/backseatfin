/** Player UI strings in English, Chinese, Spanish, Japanese and Korean. The browser's
 * language picks one (English otherwise); the viewer can switch in the settings sheet
 * (remembered per browser). Server messages stay English and technical — the page maps
 * them to these. */
export type Lang = 'en' | 'zh' | 'es' | 'ja' | 'ko'
export const LANGS: Lang[] = ['en', 'zh', 'es', 'ja', 'ko']
export const LANG_NAMES: Record<Lang, string> = { en: 'English', zh: '中文', es: 'Español', ja: '日本語', ko: '한국어' }
/** The `lang` attribute for each. */
export const HTML_LANG: Record<Lang, string> = { en: 'en', zh: 'zh-CN', es: 'es', ja: 'ja', ko: 'ko' }

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
  needsWebCodecs: "This browser can't play {server} streams here: it needs hardware H.264 decoding (WebCodecs).",
  screenNote:
    'This window can show up to {size}. The stream is never sent larger than that, so above it a higher level only raises the bitrate: a little more detail, more data.',
  playingNow: 'Playing now: {size}',
  qualityLow: 'Low',
  qualityMedium: 'Standard',
  qualityHigh: 'High',
  qualityMax: 'Max',
  stats: 'Stats for nerds',
  statsOk: 'Playing smoothly.',
  statsPaused: 'Paused, {buffer} s buffered.',
  statsStarting: 'Starting the stream…',
  statsOutage: 'Network down, reconnecting…',
  statsSlowData: 'Data arrives slower than the stream needs ({rate} of {need} Mbps), so it will stutter. A lower quality helps.',
  statsSlowServer: 'The server is slow to prepare the stream ({ms} ms per segment).',
  statsSlowDecoder: "This device can't decode fast enough: the picture is {ms} ms behind.",
  transcoder: 'Transcoding',
  transcoderAuto: 'Auto',
  transcoderServer: '{server}',
  transcoderOurs: 'BackseatFin server',
  transcoderNow: 'Now: {name}. Auto uses the BackseatFin server for HDR films (better tone mapping) and {server} for the rest.',
}
export type StringKey = keyof typeof en
/** Every key (for tests). */
export const TABLE_KEYS: Record<StringKey, unknown> = en

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
  needsWebCodecs: '这个浏览器无法在这里播放 {server} 的视频：需要 H.264 硬件解码（WebCodecs）。',
  screenNote: '这个窗口最多显示 {size}。视频不会以超过这个尺寸传输，所以再往上选更高档位，只是提高码率：细节多一点，流量也更大。',
  playingNow: '当前播放：{size}',
  qualityLow: '流畅',
  qualityMedium: '标清',
  qualityHigh: '高清',
  qualityMax: '超清',
  stats: '统计信息',
  statsOk: '播放流畅。',
  statsPaused: '已暂停，缓冲了 {buffer} 秒。',
  statsStarting: '正在开始播放…',
  statsOutage: '网络中断，正在重连…',
  statsSlowData: '数据到达的速度跟不上视频（{rate} / {need} Mbps），会卡顿。降低画质会好些。',
  statsSlowServer: '服务器准备视频太慢（每个分片 {ms} 毫秒）。',
  statsSlowDecoder: '这台设备解码跟不上：画面落后 {ms} 毫秒。',
  transcoder: '转码',
  transcoderAuto: '自动',
  transcoderServer: '{server}',
  transcoderOurs: 'BackseatFin 服务',
  transcoderNow: '当前：{name}。自动模式下，HDR 影片由 BackseatFin 服务转码（色调映射更准），其他由 {server} 转码。',
}

const es: Record<StringKey, string> = {
  back: 'Atrás',
  backTo: 'Volver a {server}',
  rewind: 'Retroceder 15 segundos',
  forward: 'Avanzar 30 segundos',
  settings: 'Calidad, audio y subtítulos',
  progress: 'Posición de reproducción',
  quality: 'Calidad',
  audio: 'Audio',
  subtitles: 'Subtítulos',
  language: 'Idioma',
  off: 'Desactivados',
  done: 'Listo',
  loading: 'Cargando… {time}',
  reconnecting: 'Se perdió la conexión, reconectando…',
  finished: 'Terminado',
  tapForSound: 'Toca para activar el sonido',
  retry: 'Reintentar',
  subtitlesLoading: 'Cargando subtítulos…',
  subtitlesFailed: 'No se pudieron cargar los subtítulos',
  errDecode: 'Este navegador no puede decodificar el vídeo ({detail})',
  errBusy: 'Todas las reproducciones están ocupadas. Inténtalo de nuevo en un momento.',
  errServer: 'El servidor tuvo un error al preparar el vídeo.',
  errUnavailable: 'No se puede reproducir: {detail}',
  errTimeout: 'El servidor tardó demasiado en enviar imagen.',
  errOutage: 'No hay conexión y no se pudo reconectar.',
  errPlayback: 'Error de reproducción',
  noItem: 'No hay nada que reproducir. Empieza la reproducción desde {server}.',
  signedOut: 'No has iniciado sesión o la sesión caducó. Pulsa Reproducir en {server} otra vez.',
  loadFailed: 'No se pudo cargar: {detail}',
  needsWebCodecs: 'Este navegador no puede reproducir vídeos de {server} aquí: necesita decodificación H.264 por hardware (WebCodecs).',
  screenNote:
    'Esta ventana muestra como máximo {size}. El vídeo nunca se envía más grande, así que por encima de eso un nivel más alto solo sube la tasa de bits: algo más de detalle, más datos.',
  playingNow: 'Reproduciendo: {size}',
  qualityLow: 'Baja',
  qualityMedium: 'Estándar',
  qualityHigh: 'Alta',
  qualityMax: 'Máxima',
  stats: 'Estadísticas para nerds',
  statsOk: 'Se reproduce con fluidez.',
  statsPaused: 'En pausa, {buffer} s en el búfer.',
  statsStarting: 'Iniciando el vídeo…',
  statsOutage: 'Sin red, reconectando…',
  statsSlowData: 'Los datos llegan más despacio de lo que necesita el vídeo ({rate} de {need} Mbps), así que se entrecortará. Una calidad más baja ayuda.',
  statsSlowServer: 'El servidor tarda en preparar el vídeo ({ms} ms por segmento).',
  statsSlowDecoder: 'Este dispositivo no decodifica lo bastante rápido: la imagen va {ms} ms por detrás.',
  transcoder: 'Transcodificación',
  transcoderAuto: 'Automática',
  transcoderServer: '{server}',
  transcoderOurs: 'Servidor BackseatFin',
  transcoderNow: 'Ahora: {name}. En automático, las películas HDR las transcodifica el servidor BackseatFin (mejor mapeo de tonos) y el resto {server}.',
}

const ja: Record<StringKey, string> = {
  back: '戻る',
  backTo: '{server} に戻る',
  rewind: '15 秒戻る',
  forward: '30 秒進む',
  settings: '画質・音声・字幕',
  progress: '再生位置',
  quality: '画質',
  audio: '音声',
  subtitles: '字幕',
  language: '言語',
  off: 'オフ',
  done: '完了',
  loading: '読み込み中… {time}',
  reconnecting: '接続が切れました。再接続しています…',
  finished: '再生終了',
  tapForSound: 'タップして音声をオン',
  retry: '再試行',
  subtitlesLoading: '字幕を読み込んでいます…',
  subtitlesFailed: '字幕を読み込めませんでした',
  errDecode: 'このブラウザでは動画をデコードできません（{detail}）',
  errBusy: '同時再生数の上限に達しています。しばらくしてからもう一度お試しください。',
  errServer: 'サーバーで動画の準備中にエラーが発生しました。',
  errUnavailable: '再生できません：{detail}',
  errTimeout: 'サーバーから映像が届くまでに時間がかかりすぎました。',
  errOutage: '接続が切れ、再接続できませんでした。',
  errPlayback: '再生エラー',
  noItem: '再生する項目がありません。{server} から再生してください。',
  signedOut: 'サインインしていないか、セッションの有効期限が切れています。{server} でもう一度再生を押してください。',
  loadFailed: '読み込めませんでした：{detail}',
  needsWebCodecs: 'このブラウザではここで {server} の動画を再生できません。H.264 のハードウェアデコード（WebCodecs）が必要です。',
  screenNote:
    'このウィンドウで表示できるのは最大 {size} です。動画がそれより大きく送られることはないため、それ以上の画質を選んでもビットレートが上がるだけです（少し精細になり、通信量が増えます）。',
  playingNow: '再生中：{size}',
  qualityLow: '低',
  qualityMedium: '標準',
  qualityHigh: '高',
  qualityMax: '最高',
  stats: '詳細統計',
  statsOk: '問題なく再生しています。',
  statsPaused: '一時停止中。{buffer} 秒分をバッファ済み。',
  statsStarting: '再生を開始しています…',
  statsOutage: 'ネットワークが切れています。再接続中…',
  statsSlowData: 'データの到着が動画に追いついていません（{rate} / {need} Mbps）。途切れます。画質を下げると改善します。',
  statsSlowServer: 'サーバーの動画準備が遅れています（1 セグメントあたり {ms} ms）。',
  statsSlowDecoder: 'この端末のデコードが追いついていません。映像が {ms} ms 遅れています。',
  transcoder: 'トランスコード',
  transcoderAuto: '自動',
  transcoderServer: '{server}',
  transcoderOurs: 'BackseatFin サーバー',
  transcoderNow: '現在：{name}。自動では HDR 作品を BackseatFin サーバー（トーンマッピングがより正確）、それ以外を {server} がトランスコードします。',
}

const ko: Record<StringKey, string> = {
  back: '뒤로',
  backTo: '{server}(으)로 돌아가기',
  rewind: '15초 뒤로',
  forward: '30초 앞으로',
  settings: '화질, 오디오, 자막',
  progress: '재생 위치',
  quality: '화질',
  audio: '오디오',
  subtitles: '자막',
  language: '언어',
  off: '끄기',
  done: '완료',
  loading: '불러오는 중… {time}',
  reconnecting: '연결이 끊겼습니다. 다시 연결하는 중…',
  finished: '재생 완료',
  tapForSound: '탭하여 소리 켜기',
  retry: '다시 시도',
  subtitlesLoading: '자막을 불러오는 중…',
  subtitlesFailed: '자막을 불러오지 못했습니다',
  errDecode: '이 브라우저에서는 영상을 디코딩할 수 없습니다 ({detail})',
  errBusy: '동시 재생 수가 가득 찼습니다. 잠시 후 다시 시도해 주세요.',
  errServer: '서버에서 영상을 준비하다가 오류가 났습니다.',
  errUnavailable: '재생할 수 없습니다: {detail}',
  errTimeout: '서버에서 화면을 보내는 데 너무 오래 걸렸습니다.',
  errOutage: '연결이 끊겼고 다시 연결하지 못했습니다.',
  errPlayback: '재생 오류',
  noItem: '재생할 항목이 없습니다. {server}에서 재생을 시작해 주세요.',
  signedOut: '로그인하지 않았거나 세션이 만료되었습니다. {server}에서 다시 재생을 눌러 주세요.',
  loadFailed: '불러오지 못했습니다: {detail}',
  needsWebCodecs: '이 브라우저에서는 여기서 {server} 영상을 재생할 수 없습니다. H.264 하드웨어 디코딩(WebCodecs)이 필요합니다.',
  screenNote:
    '이 창은 최대 {size}까지 표시합니다. 영상은 이보다 크게 전송되지 않으므로, 그 이상의 화질은 비트레이트만 올립니다. 조금 더 선명해지고 데이터는 더 씁니다.',
  playingNow: '현재 재생: {size}',
  qualityLow: '낮음',
  qualityMedium: '표준',
  qualityHigh: '높음',
  qualityMax: '최고',
  stats: '상세 통계',
  statsOk: '원활하게 재생 중입니다.',
  statsPaused: '일시 정지됨. {buffer}초 버퍼됨.',
  statsStarting: '재생을 시작하는 중…',
  statsOutage: '네트워크가 끊겼습니다. 다시 연결하는 중…',
  statsSlowData: '데이터가 영상에 필요한 속도보다 느리게 들어옵니다 ({rate} / {need} Mbps). 끊길 수 있으니 화질을 낮춰 보세요.',
  statsSlowServer: '서버가 영상을 준비하는 속도가 느립니다 (세그먼트당 {ms} ms).',
  statsSlowDecoder: '이 기기의 디코딩이 따라가지 못합니다. 화면이 {ms} ms 늦습니다.',
  transcoder: '트랜스코딩',
  transcoderAuto: '자동',
  transcoderServer: '{server}',
  transcoderOurs: 'BackseatFin 서버',
  transcoderNow: '현재: {name}. 자동에서는 HDR 영화는 BackseatFin 서버(더 정확한 톤 매핑)가, 나머지는 {server}가 트랜스코딩합니다.',
}

const TABLES: Record<Lang, Record<StringKey, string>> = { en, zh, es, ja, ko }
const KEY = 'backseatfin:lang'

const isLang = (v: unknown): v is Lang => LANGS.includes(v as Lang)

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

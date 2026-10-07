import type { EngineKind } from './types'

/** H.264 High, level 4.0 (1080p30) — what the server's h264ts output uses. */
export const H264_CODEC = 'avc1.640028'
export const AAC_CODEC = 'mp4a.40.2'

/** WebCodecs (hardware H.264, verified in the car while driving) when the browser can
 * decode both our video and audio; JSMpeg otherwise. `?engine=jsmpeg|webcodecs` on the
 * player URL forces one (debugging). */
export async function pickEngine(search: string = window.location.search): Promise<EngineKind> {
  const forced = new URLSearchParams(search).get('engine')
  if (forced === 'jsmpeg' || forced === 'webcodecs') return forced
  if (typeof VideoDecoder === 'undefined' || typeof AudioDecoder === 'undefined') return 'jsmpeg'
  try {
    const [video, audio] = await Promise.all([
      VideoDecoder.isConfigSupported({ codec: H264_CODEC }),
      AudioDecoder.isConfigSupported({ codec: AAC_CODEC, sampleRate: 48000, numberOfChannels: 2 }),
    ])
    return video.supported && audio.supported ? 'webcodecs' : 'jsmpeg'
  } catch {
    return 'jsmpeg'
  }
}

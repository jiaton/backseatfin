/**
 * Minimal MPEG-TS demuxer for the WebCodecs player: exactly what our server sends
 * (ffmpeg mpegts, one H.264 program + one AAC-ADTS program), nothing more.
 *
 *   188-byte packets → PAT → PMT → per-PID PES reassembly → PTS
 *   video PES = one H.264 access unit (Annex-B)       → onVideo
 *   audio PES = one or more ADTS frames → raw AAC      → onAudio (+ AudioSpecificConfig)
 */

import { isKeyframe } from './annexb'

const PACKET = 188
const SYNC = 0x47
const STREAM_H264 = 0x1b
const STREAM_AAC_ADTS = 0x0f

export interface VideoSample {
  pts: number // seconds
  key: boolean
  data: Uint8Array // Annex-B access unit
}

export interface AacConfig {
  sampleRate: number
  channels: number
  /** AudioSpecificConfig (the `description` AudioDecoder wants for raw AAC). */
  asc: Uint8Array
}

export interface AudioSample {
  pts: number // seconds
  data: Uint8Array // one raw AAC frame (ADTS header stripped)
  config: AacConfig
}

const SAMPLE_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]

function readPts(b: Uint8Array, i: number): number {
  // 33-bit timestamp spread over 5 bytes with marker bits; 90 kHz clock.
  const hi = (b[i] & 0x0e) * 0x20000000 // bits 32..30 (shifted left by 29, as a float)
  const mid = ((b[i + 1] << 8) | b[i + 2]) >> 1
  const lo = ((b[i + 3] << 8) | b[i + 4]) >> 1
  return (hi + mid * 0x8000 + lo) / 90000
}

/** Splits an ADTS PES payload into raw AAC frames, each with its own timestamp. */
export function parseAdts(payload: Uint8Array, pts: number): AudioSample[] {
  const out: AudioSample[] = []
  let i = 0
  while (i + 7 <= payload.length) {
    if (payload[i] !== 0xff || (payload[i + 1] & 0xf0) !== 0xf0) break
    const protectionAbsent = payload[i + 1] & 0x01
    const profile = (payload[i + 2] >> 6) & 0x03 // audioObjectType - 1
    const srIndex = (payload[i + 2] >> 2) & 0x0f
    const channels = ((payload[i + 2] & 0x01) << 2) | ((payload[i + 3] >> 6) & 0x03)
    const frameLength = ((payload[i + 3] & 0x03) << 11) | (payload[i + 4] << 3) | ((payload[i + 5] >> 5) & 0x07)
    const headerLength = protectionAbsent ? 7 : 9
    if (frameLength < headerLength || i + frameLength > payload.length) break
    const sampleRate = SAMPLE_RATES[srIndex] ?? 48000
    const objectType = profile + 1
    const asc = new Uint8Array([(objectType << 3) | (srIndex >> 1), ((srIndex & 1) << 7) | (channels << 3)])
    out.push({
      pts: pts + (out.length * 1024) / sampleRate,
      data: payload.subarray(i + headerLength, i + frameLength),
      config: { sampleRate, channels, asc },
    })
    i += frameLength
  }
  return out
}

export class TsDemuxer {
  private pmtPid = -1
  private videoPid = -1
  private audioPid = -1
  private carry = new Uint8Array(0)
  private pes = new Map<number, Uint8Array[]>()

  private readonly onVideo: (s: VideoSample) => void
  private readonly onAudio: (s: AudioSample) => void

  constructor(onVideo: (s: VideoSample) => void, onAudio: (s: AudioSample) => void) {
    this.onVideo = onVideo
    this.onAudio = onAudio
  }

  push(bytes: Uint8Array): void {
    let buf = bytes
    if (this.carry.length) {
      buf = new Uint8Array(this.carry.length + bytes.length)
      buf.set(this.carry)
      buf.set(bytes, this.carry.length)
    }
    let i = 0
    while (i + PACKET <= buf.length) {
      if (buf[i] !== SYNC) {
        i++ // resync
        continue
      }
      this.packet(buf.subarray(i, i + PACKET))
      i += PACKET
    }
    this.carry = buf.slice(i)
  }

  /** Emits whatever PES is still being assembled (end of stream). */
  flush(): void {
    for (const pid of [...this.pes.keys()]) this.emitPes(pid)
  }

  private packet(p: Uint8Array): void {
    const start = (p[1] & 0x40) !== 0
    const pid = ((p[1] & 0x1f) << 8) | p[2]
    const adaptation = (p[3] >> 4) & 0x03
    let off = 4
    if (adaptation === 2 || adaptation === 0) return // no payload
    if (adaptation === 3) off += 1 + p[4]
    if (off >= PACKET) return
    const payload = p.subarray(off)

    if (pid === 0) return this.parsePat(payload, start)
    if (pid === this.pmtPid) return this.parsePmt(payload, start)
    if (pid !== this.videoPid && pid !== this.audioPid) return
    if (start) this.emitPes(pid)
    if (start || this.pes.has(pid)) {
      const parts = this.pes.get(pid) ?? []
      parts.push(payload.slice())
      this.pes.set(pid, parts)
    }
  }

  private parsePat(payload: Uint8Array, start: boolean): void {
    if (!start) return
    const s = 1 + payload[0] // pointer field
    const sectionLength = ((payload[s + 1] & 0x0f) << 8) | payload[s + 2]
    for (let i = s + 8; i < s + 3 + sectionLength - 4; i += 4) {
      const program = (payload[i] << 8) | payload[i + 1]
      if (program !== 0) {
        this.pmtPid = ((payload[i + 2] & 0x1f) << 8) | payload[i + 3]
        return
      }
    }
  }

  private parsePmt(payload: Uint8Array, start: boolean): void {
    if (!start) return
    const s = 1 + payload[0]
    const sectionLength = ((payload[s + 1] & 0x0f) << 8) | payload[s + 2]
    const programInfoLength = ((payload[s + 10] & 0x0f) << 8) | payload[s + 11]
    const end = s + 3 + sectionLength - 4
    for (let i = s + 12 + programInfoLength; i + 5 <= end; ) {
      const type = payload[i]
      const pid = ((payload[i + 1] & 0x1f) << 8) | payload[i + 2]
      const esInfoLength = ((payload[i + 3] & 0x0f) << 8) | payload[i + 4]
      if (type === STREAM_H264 && this.videoPid < 0) this.videoPid = pid
      if (type === STREAM_AAC_ADTS && this.audioPid < 0) this.audioPid = pid
      i += 5 + esInfoLength
    }
  }

  private emitPes(pid: number): void {
    const parts = this.pes.get(pid)
    this.pes.delete(pid)
    if (!parts?.length) return
    const total = parts.reduce((n, p) => n + p.length, 0)
    const pes = new Uint8Array(total)
    let o = 0
    for (const part of parts) {
      pes.set(part, o)
      o += part.length
    }
    if (pes.length < 9 || pes[0] !== 0 || pes[1] !== 0 || pes[2] !== 1) return
    const ptsDtsFlags = (pes[7] >> 6) & 0x03
    const headerLength = pes[8]
    if (!(ptsDtsFlags & 0x02)) return // no PTS: nothing to schedule it by
    const pts = readPts(pes, 9)
    const data = pes.subarray(9 + headerLength)
    if (pid === this.videoPid) this.onVideo({ pts, key: isKeyframe(data), data })
    else for (const a of parseAdts(data, pts)) this.onAudio(a)
  }
}

/**
 * Splits a raw H.264 Annex-B byte stream (as the server sends it for the WebCodecs
 * probe: one AUD NAL before every frame) into access units — one per frame — which is
 * what WebCodecs' VideoDecoder wants per EncodedVideoChunk.
 */

const NAL_AUD = 9
const NAL_IDR = 5

/** Offsets of every NAL start code (3- or 4-byte) in `buf`, with the NAL type. */
function startCodes(buf: Uint8Array, from: number): { at: number; type: number }[] {
  const found: { at: number; type: number }[] = []
  for (let i = from; i + 3 < buf.length; i++) {
    if (buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 1) {
      const at = i > 0 && buf[i - 1] === 0 ? i - 1 : i
      found.push({ at, type: buf[i + 3] & 0x1f })
      i += 2
    }
  }
  return found
}

export function isKeyframe(accessUnit: Uint8Array): boolean {
  return startCodes(accessUnit, 0).some((s) => s.type === NAL_IDR)
}

export class AnnexBSplitter {
  private pending = new Uint8Array(0)

  /** Feeds bytes; returns every access unit completed by them (the last, still-open
   * one stays pending until the next AUD arrives). */
  push(bytes: Uint8Array): Uint8Array[] {
    const merged = new Uint8Array(this.pending.length + bytes.length)
    merged.set(this.pending)
    merged.set(bytes, this.pending.length)
    // Re-scan from a little before the seam: a start code may straddle two chunks.
    const auds = startCodes(merged, Math.max(0, this.pending.length - 4)).filter((s) => s.type === NAL_AUD)
    const units: Uint8Array[] = []
    let start = 0
    for (const aud of auds) {
      if (aud.at > start) units.push(merged.subarray(start, aud.at))
      start = aud.at
    }
    this.pending = merged.slice(start)
    return units
  }
}

import { type AudioSample, TsDemuxer, type VideoSample } from './mpegts'

/** New picture held while waiting for the new connection's first sound: a stream with
 * copied video starts its picture up to a GOP before its sound (several seconds). Past
 * this much, the stream evidently has no sound and is placed by its picture. */
const MAX_WAIT_S = 10
const MAX_WAIT_SAMPLES = 1200

export interface SpliceSinks {
  video(s: VideoSample): void
  audio(s: AudioSample): void
  /** The new picture starts at `pts` (this timeline): drop received video from there on. */
  cutVideo(pts: number): void
  /** The newest pts already handed to the video decoder: the new picture must start
   * after it (it can't replace frames being decoded). */
  videoFloor(): number
}

/**
 * The demuxer for a second connection, spliced onto what's buffered. The new stream was
 * asked to start at the film time where the received *sound* ends (`audioCut`, a pts on
 * this timeline), and its sound starts exactly there, while its picture may start at the
 * keyframe before (ffmpeg copying the video) or there too (re-encoding). So the new
 * timestamps are moved to put its first sound on `audioCut`: the sound goes on with no
 * gap (an AudioDecoder stamps its output by counting on from earlier input, so a gap
 * would shift all later sound), and the picture switches to the new stream at its first
 * keyframe (the old picture from there on is dropped). With no sound received
 * (`audioCut` null) the first keyframe is placed on `videoCut`, as before.
 */
export function splicedDemuxer(audioCut: number | null, videoCut: number, sinks: SpliceSinks): TsDemuxer {
  const { video, audio } = spliceSamples(audioCut, videoCut, sinks)
  return new TsDemuxer(video, audio)
}

/** splicedDemuxer's sample handling (what its MPEG-TS parser calls). */
export function spliceSamples(audioCut: number | null, videoCut: number, sinks: SpliceSinks) {
  let shift: number | null = null
  let started = false // the new picture has begun (at a keyframe after the floor)
  const heldVideo: VideoSample[] = []
  const heldAudio: AudioSample[] = []

  const videoAt = (v: VideoSample) => {
    const pts = v.pts + shift!
    if (!started) {
      if (!v.key || pts <= sinks.videoFloor() + 0.001) return
      started = true
      sinks.cutVideo(pts)
    }
    sinks.video({ ...v, pts, dts: v.dts + shift! })
  }
  const audioAt = (a: AudioSample) => {
    const pts = a.pts + shift!
    // Sound before the cut duplicates what's buffered.
    if (pts >= (audioCut ?? videoCut) - 0.001) sinks.audio({ ...a, pts })
  }
  const place = (value: number) => {
    shift = value
    for (const v of heldVideo.splice(0)) videoAt(v)
    for (const a of heldAudio.splice(0)) audioAt(a)
  }

  return {
    video: (v: VideoSample) => {
      if (shift != null) return videoAt(v)
      heldVideo.push(v)
      const span = v.pts - heldVideo[0].pts
      if (audioCut == null || span > MAX_WAIT_S || heldVideo.length > MAX_WAIT_SAMPLES) {
        const key = heldVideo.find((h) => h.key)
        if (key) place(videoCut - key.pts)
        else if (heldVideo.length > MAX_WAIT_SAMPLES) heldVideo.length = 0 // nothing to start from
      }
    },
    audio: (a: AudioSample) => {
      if (shift != null) return audioAt(a)
      if (audioCut != null) place(audioCut - a.pts)
      // Placed by picture: sound before the first keyframe waits for it (bounded).
      if (shift != null) audioAt(a)
      else if (heldAudio.length < 500) heldAudio.push(a)
    },
  }
}

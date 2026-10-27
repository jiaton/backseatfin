import type { EngineKind } from './engines/types'
import type { Cue } from './captions'
import type { Level, Quality } from './quality'

/** Everything the player page needs from a media server, whichever one it is: Emby or
 * Jellyfin transcoding themselves, straight from the browser (`sources/mediaserver.ts`),
 * or the optional BackseatFin server transcoding Emby (`sources/backseatfin.ts`). */

export interface Track {
  /** The server's stream index (what it's asked for by). */
  index: number
  title: string
  /** Subtitles: 'text' (may need preparing first) or 'image'. */
  kind?: string
  isDefault: boolean
  /** Caption tracks the page draws itself (PlaybackSource.captions): their language,
   * and whether they're automatic (speech recognition). */
  lang?: string
  auto?: boolean
}

export interface PlayerItem {
  id: string
  /** As shown in the top bar ("Series S1E2 · Episode" for episodes). */
  title: string
  /** Seconds; NaN if unknown. */
  duration: number
  audioTracks: Track[]
  subtitleTracks: Track[]
  /** HDR or Dolby Vision (the BackseatFin server tone-maps those better than Emby). */
  hdr?: boolean
}

/** What the viewer picked; every change reconnects the stream. */
export interface StreamChoice {
  quality: Quality
  audio?: number
  sub?: number
  /** The player's display box in device pixels (the stream is never sent larger). */
  box: { w: number; h: number }
}

export type PlaybackEvent = 'start' | 'progress' | 'stopped'

export type SubtitleState = 'pending' | 'ready' | 'failed'

export interface PlaybackSource {
  /** The media server's name, for messages ("Back to Jellyfin"). */
  readonly server: string
  readonly item: PlayerItem
  /** Engines this source can stream to, preferred first. */
  readonly engines: readonly EngineKind[]
  /** What each quality level sends with this engine (size cap and bitrate). */
  levels(engine: EngineKind): Record<Quality, Level>
  streamUrl(startSeconds: number, engine: EngineKind, choice: StreamChoice): string
  headers?(): Record<string, string>
  /** The stream may have B-frames (see CarVideoSource.reorder). */
  readonly reorder?: boolean
  /** Best effort: resume points and "watched" stay in sync with the server's other
   * clients. `leaving`: the page is going away (the request must survive that). */
  report(event: PlaybackEvent, positionSeconds: number, choice: StreamChoice, opts?: { paused?: boolean; leaving?: boolean }): void
  /** Captions the page draws over the picture itself, by track index: every track of
   * YouTube's, a media server's text tracks (kind 'text'; image ones stay burned in).
   * Choosing one needs no new stream. */
  captions?(index: number): Promise<Cue[]>
  /** Text subtitles the server has to prepare before it can burn them in (Emby). */
  prepareSubtitle?(index: number): Promise<SubtitleState>
}

export function episodeTitle(name: string, series?: string | null, season?: number | null, episode?: number | null) {
  if (!series) return name
  const se = season != null && episode != null ? ` S${season}E${episode}` : ''
  return `${series}${se} · ${name}`
}

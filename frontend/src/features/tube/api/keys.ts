/** Query keys for the tube feature (one place, so mutations invalidate the right ones). */
export const tubeKeys = {
  all: ['tube'] as const,
  home: ['tube', 'home'] as const,
  search: (q: string, kind: string) => ['tube', 'search', kind, q] as const,
  video: (id: string) => ['tube', 'video', id] as const,
  /** A video's card as a list showed it: lets its page draw at once while the full
   * details (a few seconds: YouTube is asked for its streams too) load. */
  card: (id: string) => ['tube', 'card', id] as const,
  channel: (id: string) => ['tube', 'channel', id] as const,
  playlist: (id: string) => ['tube', 'playlist', id] as const,
}

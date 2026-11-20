import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { createCarButtons, loadCarButtons, saveCarButtons, toneWav } from './car-buttons'

const handlers = new Map<string, MediaSessionActionHandler | null>()
const session = {
  metadata: null as MediaMetadata | null,
  playbackState: 'none' as MediaSessionPlaybackState,
  setActionHandler: (a: string, h: MediaSessionActionHandler | null) => handlers.set(a, h),
}

beforeEach(() => {
  handlers.clear()
  Object.defineProperty(navigator, 'mediaSession', { value: session, configurable: true })
  vi.stubGlobal('MediaMetadata', class { constructor(init: object) { Object.assign(this, init) } })
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:tone' }))
})
afterEach(() => vi.restoreAllMocks())

function fakePlayer() {
  const p = { isPaused: false, title: 'Show S1E2 · Pilot', artist: 'Jellyfin' }
  return Object.assign(p, {
    paused: () => p.isPaused,
    play: vi.fn(() => (p.isPaused = false)),
    pause: vi.fn(() => (p.isPaused = true)),
    seekBy: vi.fn(),
  })
}

test('the loop is 10 s of a quiet tone, not silence', async () => {
  const wav = new DataView(await toneWav().arrayBuffer())
  expect(wav.byteLength).toBe(44 + 8000 * 10 * 2)
  const samples = Array.from({ length: 320 }, (_, i) => Math.abs(wav.getInt16(44 + i * 2, true)))
  expect(Math.max(...samples)).toBe(33) // −60 dBFS
})

test('remembered per browser, off by default', () => {
  const store = new Map<string, string>()
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) }
  expect(loadCarButtons(storage)).toBe(false)
  saveCarButtons(true, storage)
  expect(loadCarButtons(storage)).toBe(true)
  saveCarButtons(false, storage)
  expect(loadCarButtons(storage)).toBe(false)
})

test("the car's play button toggles, handlers only once the loop plays", async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValueOnce(new Error('no tap')).mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValue(false)
  const player = fakePlayer()
  const buttons = createCarButtons(player)
  await buttons.start()
  expect(handlers.get('play')).toBeUndefined() // refused without a tap
  await buttons.start()
  expect(play).toHaveBeenCalledTimes(2)
  expect(session.playbackState).toBe('playing')
  expect(session.metadata).toMatchObject({ title: 'Show S1E2 · Pilot', artist: 'Jellyfin' })

  handlers.get('play')!({ action: 'play' })
  expect(player.pause).toHaveBeenCalled()
  handlers.get('play')!({ action: 'play' })
  expect(player.play).toHaveBeenCalled()
  handlers.get('seekforward')!({ action: 'seekforward' })
  expect(player.seekBy).toHaveBeenCalledWith(10)

  buttons.stop()
  expect(handlers.get('play')).toBeNull()
  expect(session.playbackState).toBe('none')
})

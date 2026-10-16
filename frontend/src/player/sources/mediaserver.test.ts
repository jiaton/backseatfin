import { afterEach, describe, expect, it, vi } from 'vitest'

import { CREDENTIALS_KEY } from '../params'
import { MEDIA_SERVER_LEVELS } from '../quality'
import type { StreamChoice } from '../source'
import { authorization, createServerSource, deviceId, readServerCredentials, serverRoot, streamQuery } from './mediaserver'

const mem = (entries: [string, string][] = []) => {
  const m = new Map(entries)
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}

const CHOICE: StreamChoice = { quality: 'medium', audio: 2, sub: 3, box: { w: 1600, h: 900 } }

describe('media server source helpers', () => {
  it('finds the server root before /BackseatFin/', () => {
    expect(serverRoot('/BackseatFin/play')).toBe('')
    expect(serverRoot('/jellyfin/BackseatFin/play')).toBe('/jellyfin')
    expect(serverRoot('/car/play')).toBe('')
    expect(serverRoot('/emby/car/play')).toBe('/emby')
    expect(serverRoot('/play')).toBe('')
  })

  it("reads the session inject.js left, else the web app's own", () => {
    const left = mem([[CREDENTIALS_KEY, JSON.stringify({ token: 't1', userId: 'u1' })]])
    const jf = mem([['jellyfin_credentials', JSON.stringify({ Servers: [{ Id: 's', AccessToken: 't2', UserId: 'u2' }] })]])
    expect(readServerCredentials('Jellyfin', left, jf)).toEqual({ token: 't1', userId: 'u1' })
    expect(readServerCredentials('Jellyfin', mem(), jf)).toEqual({ token: 't2', userId: 'u2' })
    expect(readServerCredentials('Emby', mem(), jf)).toBeNull()
    const emby = mem([['servercredentials3', JSON.stringify({ Servers: [{ AccessToken: 't3', UserId: 'u3' }] })]])
    expect(readServerCredentials('Emby', mem(), emby)).toEqual({ token: 't3', userId: 'u3' })
    expect(readServerCredentials('Jellyfin', mem(), mem([['jellyfin_credentials', '{"Servers":[{}]}']]))).toBeNull()
    expect(readServerCredentials('Jellyfin', mem(), mem([['jellyfin_credentials', 'nope']]))).toBeNull()
  })

  it('keeps one device id per browser', () => {
    const store = mem()
    const id = deviceId(store)
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    expect(deviceId(store)).toBe(id)
  })

  it('builds the authorization header without letting values break out of quotes', () => {
    expect(authorization('tok"en', 'dev')).toBe(
      'MediaBrowser Client="BackseatFin", Device="Car browser", DeviceId="dev", Version="0.2.4", Token="token"',
    )
  })

  const JF = MEDIA_SERVER_LEVELS.Jellyfin

  it('asks for H.264/AAC stereo in TS segments, sized to the level and the screen', () => {
    const q = streamQuery('ms', 'ps', 'dev', CHOICE, JF.medium)
    expect(Object.fromEntries(q)).toMatchObject({
      MediaSourceId: 'ms', PlaySessionId: 'ps', DeviceId: 'dev', VideoCodec: 'h264', AudioCodec: 'aac',
      MaxAudioChannels: '2', SegmentContainer: 'ts', VideoBitrate: '1500000', MaxHeight: '720', MaxWidth: '1280',
      AudioStreamIndex: '2', SubtitleStreamIndex: '3', SubtitleMethod: 'Encode',
    })
    // a small window caps the height; no subtitles is -1
    const small = streamQuery('ms', 'ps', 'dev', { quality: 'high', box: { w: 800, h: 334 } }, JF.high)
    expect(small.get('MaxHeight')).toBe('334')
    expect(small.get('MaxWidth')).toBe('800')
    expect(small.get('SubtitleStreamIndex')).toBe('-1')
    expect(small.has('SubtitleMethod')).toBe(false)
    expect(small.has('AudioStreamIndex')).toBe(false)
    // unknown box (not laid out yet): the level alone
    const unknown = streamQuery('ms', 'ps', 'dev', { quality: 'low', box: { w: 0, h: 0 } }, JF.low)
    expect(unknown.get('MaxHeight')).toBe('480')
    expect(unknown.get('MaxWidth')).toBe('854')
  })
})

describe('createServerSource', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  const ITEM = {
    Id: 'abc', Name: 'Pilot', SeriesName: 'Show', ParentIndexNumber: 1, IndexNumber: 2, RunTimeTicks: 36_000_000_000,
    MediaSources: [{ Id: 'ms1', MediaStreams: [
      { Type: 'Video', Index: 0, VideoRange: 'HDR 10' },
      { Type: 'Audio', Index: 1, DisplayTitle: 'English AAC 5.1', IsDefault: true },
      { Type: 'Audio', Index: 2, DisplayTitle: 'Japanese' },
      { Type: 'Subtitle', Index: 3, DisplayTitle: 'English', IsTextSubtitleStream: true },
      { Type: 'Subtitle', Index: 4, DisplayTitle: 'English PGS', IsTextSubtitleStream: false },
    ] }],
  }

  function setup() {
    sessionStorage.setItem(CREDENTIALS_KEY, JSON.stringify({ token: 'tok', userId: 'u1' }))
    const calls: { method: string; url: string; body?: unknown; keepalive?: boolean; auth?: string }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        method: init.method ?? 'GET', url, keepalive: init.keepalive,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
        auth: (init.headers as Record<string, string>).Authorization,
      })
      return new Response(url.startsWith('/jf/Users/u1/Items/') ? JSON.stringify(ITEM) : null, { status: url.startsWith('/jf/Users/u1/Items/') ? 200 : 204 })
    }))
    return calls
  }

  it('loads the item as the viewer and maps its tracks', async () => {
    const calls = setup()
    const source = await createServerSource('Jellyfin', 'abc', '/jf')
    expect(calls[0]).toMatchObject({ method: 'GET', url: '/jf/Users/u1/Items/abc' })
    expect(calls[0].auth).toContain('Token="tok"')
    expect(source.item).toMatchObject({ title: 'Show S1E2 · Pilot', duration: 3600, hdr: true })
    expect(source.server).toBe('Jellyfin')
    expect(source.item.audioTracks.map((t) => [t.index, t.title, t.isDefault])).toEqual([
      [1, 'English AAC 5.1', true],
      [2, 'Japanese', false],
    ])
    expect(source.item.subtitleTracks.map((t) => t.kind)).toEqual(['text', 'image'])
    expect(source.engines).toEqual(['hls'])
    expect(source.prepareSubtitle).toBeUndefined()
  })

  it("asks Emby for the bitrate that buys each level's width", async () => {
    sessionStorage.setItem(CREDENTIALS_KEY, JSON.stringify({ token: 'tok', userId: 'u1' }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(ITEM))))
    const source = await createServerSource('Emby', 'abc')
    const url = new URL(source.streamUrl(0, 'hls', CHOICE)) // medium
    expect(url.searchParams.get('VideoBitrate')).toBe('3000000') // Emby: 1280 wide from 3 Mbps
    expect(source.levels('hls').medium).toEqual({ width: 1280, height: 720, kbps: 3000 })
  })

  it('keeps one transcode across seeks, starts a new one (and stops the old) on a new choice', async () => {
    const calls = setup()
    const source = await createServerSource('Jellyfin', 'abc', '/jf')
    const a = new URL(source.streamUrl(0, 'hls', CHOICE))
    const b = new URL(source.streamUrl(600, 'hls', CHOICE))
    expect(a.pathname).toBe('/jf/Videos/abc/master.m3u8')
    expect(b.hash).toBe('#t=600')
    const session = a.searchParams.get('PlaySessionId')
    expect(b.searchParams.get('PlaySessionId')).toBe(session)
    const c = new URL(source.streamUrl(600, 'hls', { ...CHOICE, audio: 1 }))
    expect(c.searchParams.get('PlaySessionId')).not.toBe(session)
    await Promise.resolve()
    const stop = calls.find((x) => x.method === 'DELETE')!
    expect(stop.url).toContain('/jf/Videos/ActiveEncodings?')
    expect(new URLSearchParams(stop.url.split('?')[1]).get('playSessionId')).toBe(session)
  })

  it('reports progress in ticks with the tracks, and stops the transcode when leaving', async () => {
    const calls = setup()
    const source = await createServerSource('Jellyfin', 'abc', '/jf')
    source.streamUrl(0, 'hls', CHOICE)
    source.report('progress', 12.5, CHOICE, { paused: true })
    source.report('stopped', 30, CHOICE, { leaving: true })
    const progress = calls.find((x) => x.url === '/jf/Sessions/Playing/Progress')!
    expect(progress.body).toMatchObject({ ItemId: 'abc', MediaSourceId: 'ms1', PositionTicks: 125_000_000, IsPaused: true, AudioStreamIndex: 2, SubtitleStreamIndex: 3, PlayMethod: 'Transcode' })
    const stopped = calls.find((x) => x.url === '/jf/Sessions/Playing/Stopped')!
    expect(stopped).toMatchObject({ keepalive: true, body: { PositionTicks: 300_000_000 } })
    expect(calls.some((x) => x.method === 'DELETE' && x.keepalive)).toBe(true)
  })

  it('says "not signed in" without a session', async () => {
    await expect(createServerSource('Emby', 'abc')).rejects.toMatchObject({ status: 401 })
  })
})

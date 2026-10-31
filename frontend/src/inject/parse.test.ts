import { describe, expect, it } from 'vitest'

import { isActive, isPlayerRoute, parsePlaybackInfo, parsePlaybackUrl, playerUrl, withTracks } from './parse'

const BASE = 'https://car.example.com/web/index.html'

describe('parsePlaybackUrl', () => {
  it('reads a direct-play URL with #t=', () => {
    expect(parsePlaybackUrl('/emby/videos/5/stream.mkv?Static=true&MediaSourceId=abc#t=1234.5', BASE)).toEqual({
      item: '5', t: 1234, audio: undefined, sub: undefined,
    })
  })

  it('reads an HLS transcode URL with ticks and chosen tracks', () => {
    const url = 'https://car.example.com/emby/videos/77/master.m3u8?StartTimeTicks=6000000000&AudioStreamIndex=2&SubtitleStreamIndex=4'
    expect(parsePlaybackUrl(url, BASE)).toEqual({ item: '77', t: 600, audio: 2, sub: 4 })
  })

  it('treats SubtitleStreamIndex=-1 as no subtitles', () => {
    expect(parsePlaybackUrl('/emby/videos/77/master.m3u8?SubtitleStreamIndex=-1', BASE)?.sub).toBeUndefined()
  })

  it('ignores everything that is not a video playback URL', () => {
    for (const url of [
      '/emby/Items/5/Images/Primary',
      '/emby/Audio/5/universal',
      '/emby/videos/5/subtitles/3/stream.vtt',
      'blob:https://car.example.com/abc',
      '',
    ]) {
      expect(parsePlaybackUrl(url, BASE)).toBeNull()
    }
  })
})

it('builds the player URL and recognizes player routes', () => {
  expect(playerUrl({ item: '5', t: 90, sub: 4 }, '/web/index.html#!/item?id=5')).toBe(
    '/car/play?item=5&t=90&back=%2Fweb%2Findex.html%23%21%2Fitem%3Fid%3D5&sub=4',
  )
  expect(isPlayerRoute('https://car.example.com/web/index.html#!/videoosd/videoosd.html')).toBe(true)
  expect(isPlayerRoute('https://car.example.com/web/index.html#!/item?id=5')).toBe(false)
})

describe('Jellyfin', () => {
  const JF = 'https://jf.example.com/web/#/details?id=4d9b'

  it('reads its direct-play and HLS URLs', () => {
    expect(
      parsePlaybackUrl('/Videos/4d9bae7ba369f70422265cc2c7634e95/stream.mkv?Static=true&mediaSourceId=4d9b#t=61', JF),
    ).toEqual({ item: '4d9bae7ba369f70422265cc2c7634e95', t: 61, audio: undefined, sub: undefined })
    expect(
      parsePlaybackUrl('/jf/Videos/4d9b/master.m3u8?AudioStreamIndex=2&SubtitleStreamIndex=3&StartTimeTicks=300000000', JF),
    ).toEqual({ item: '4d9b', t: 30, audio: 2, sub: 3 })
    // its HLS player writes the id as a dashed GUID
    expect(
      parsePlaybackUrl('/videos/4d9bae7b-a369-f704-2226-5cc2c7634e95/master.m3u8?StartTimeTicks=790000000', JF)?.item,
    ).toBe('4d9bae7b-a369-f704-2226-5cc2c7634e95')
  })

  it('recognizes its player routes, and builds the plugin player URL', () => {
    expect(isPlayerRoute('https://jf.example.com/web/#/video')).toBe(true)
    expect(isPlayerRoute('https://jf.example.com/web/#/queue')).toBe(true)
    expect(isPlayerRoute('https://jf.example.com/web/#/videos?parentId=1')).toBe(false)
    expect(isPlayerRoute('https://jf.example.com/web/#/details?id=4d9b')).toBe(false)
    expect(playerUrl({ item: '4d9b', t: 0 }, '/web/#/details?id=4d9b', true, '/BackseatFin/play')).toBe(
      '/BackseatFin/play?item=4d9b&t=0&back=%2Fweb%2F%23%2Fdetails%3Fid%3D4d9b&embed=1',
    )
  })
})

it('acts always on a car-only page, and only in car mode when opted in', () => {
  expect(isActive(undefined, null)).toBe(true)
  expect(isActive('always', null)).toBe(true)
  expect(isActive('opt-in', null)).toBe(false)
  expect(isActive('opt-in', '0')).toBe(false)
  expect(isActive('opt-in', '1')).toBe(true)
})

it("keeps the server's PlaySessionId (a retry of a handed-off playback has the same one)", () => {
  expect(parsePlaybackUrl('/videos/77/master.m3u8?PlaySessionId=abc', 'https://car.example.com/web/')?.session).toBe('abc')
  expect(parsePlaybackUrl('/videos/77/stream.mkv?Static=true', 'https://car.example.com/web/')?.session).toBeUndefined()
})

it('gives a hosted player the full address and the server origin', () => {
  const url = playerUrl({ item: '5', t: 0 }, '/web/', true, 'https://jiaton.github.io/backseatfin/emby/play', 'https://emby.example.com')
  const u = new URL(url)
  expect(u.origin + u.pathname).toBe('https://jiaton.github.io/backseatfin/emby/play')
  expect(u.searchParams.get('server')).toBe('https://emby.example.com')
})

describe('parsePlaybackInfo', () => {
  const base = 'https://car.example.com/web/index.html'

  it("reads Emby's tracks from the query", () => {
    expect(parsePlaybackInfo('/emby/Items/8/PlaybackInfo?UserId=u&AudioStreamIndex=1&SubtitleStreamIndex=3', base)).toEqual({ item: '8', audio: 1, sub: 3 })
  })

  it("reads Jellyfin's from the JSON body, and -1 as none", () => {
    const body = JSON.stringify({ IsPlayback: true, AudioStreamIndex: '2', SubtitleStreamIndex: -1 })
    expect(parsePlaybackInfo('/Items/abc/PlaybackInfo', base, body)).toEqual({ item: 'abc', audio: 2, sub: undefined })
    const picked = JSON.stringify({ AudioStreamIndex: 1, SubtitleStreamIndex: '3' })
    expect(parsePlaybackInfo('/Items/abc/PlaybackInfo', base, picked)).toEqual({ item: 'abc', audio: 1, sub: 3 })
  })

  it('ignores other requests, and PlaybackInfo that is only looking', () => {
    expect(parsePlaybackInfo('/Items/8/Images/Primary', base)).toBeNull()
    expect(parsePlaybackInfo('/emby/Items/8/PlaybackInfo?IsPlayback=false&StartTimeTicks=0', base)).toBeNull()
    expect(parsePlaybackInfo('/Items/abc/PlaybackInfo', base, JSON.stringify({ IsPlayback: false, SubtitleStreamIndex: 3 }))).toBeNull()
  })
})

describe('withTracks', () => {
  it("fills in the item page's tracks the playback URL leaves out", () => {
    const h = { item: '0123abcd', t: 5, audio: 1 }
    expect(withTracks(h, { item: '0123ABCD', audio: 2, sub: 3 })).toEqual({ item: '0123abcd', t: 5, audio: 1, sub: 3 })
  })

  it("leaves another item's hand-off alone", () => {
    const h = { item: '9', t: 0 }
    expect(withTracks(h, { item: '8', sub: 3 })).toBe(h)
  })
})

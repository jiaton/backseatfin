import { describe, expect, it } from 'vitest'

import { isPlayerRoute, parsePlaybackUrl, playerUrl } from './parse'

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

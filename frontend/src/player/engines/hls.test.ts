import { describe, expect, it } from 'vitest'

import { firstVariant, parseMediaPlaylist, segmentAt, splitStart, subtitleRendition, withStart } from './hls'

// Shapes as Jellyfin serves them (query strings shortened).
const MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1628000,AVERAGE-BANDWIDTH=1628000,VIDEO-RANGE=SDR,CODECS="avc1.424029,mp4a.40.2",RESOLUTION=1280x545,FRAME-RATE=24
main.m3u8?MediaSourceId=abc&PlaySessionId=p1
`
const MEDIA = `#EXTM3U
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:3
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:3.000000, nodesc
hls1/main/0.ts?MediaSourceId=abc&runtimeTicks=0
#EXTINF:3.000000, nodesc
hls1/main/1.ts?MediaSourceId=abc&runtimeTicks=30000000
#EXTINF:2.500000, nodesc
hls1/main/2.ts?MediaSourceId=abc&runtimeTicks=60000000
#EXT-X-ENDLIST
`
const BASE = 'https://jf.example.com/Videos/abc/master.m3u8?MediaSourceId=abc'

describe('hls playlists', () => {
  it('finds the variant of a master playlist, resolved against it', () => {
    expect(firstVariant(MASTER, BASE)).toBe('https://jf.example.com/Videos/abc/main.m3u8?MediaSourceId=abc&PlaySessionId=p1')
    expect(firstVariant(MEDIA, BASE)).toBeNull()
  })

  it("finds Emby's subtitle rendition (one track, segmented alongside the video)", () => {
    const emby = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English (SUBRIP)",DEFAULT=NO,FORCED=NO,AUTOSELECT=NO,URI="subtitles.m3u8?PlaySessionId=p1&CurrentSubtitleStreamIndex=3&SubtitleSegmentLength=3",LANGUAGE="en"
#EXT-X-STREAM-INF:BANDWIDTH=1353600,CODECS="avc1.640029,mp4a.40.2",RESOLUTION=720x307,SUBTITLES="subs"
main.m3u8?PlaySessionId=p1
`
    expect(subtitleRendition(emby, BASE)).toBe('https://jf.example.com/Videos/abc/subtitles.m3u8?PlaySessionId=p1&CurrentSubtitleStreamIndex=3&SubtitleSegmentLength=3')
    expect(firstVariant(emby, BASE)).toBe('https://jf.example.com/Videos/abc/main.m3u8?PlaySessionId=p1')
    expect(subtitleRendition(MASTER, BASE)).toBeNull()
  })

  it('lists segments with absolute URLs and start times', () => {
    const segs = parseMediaPlaylist(MEDIA, 'https://jf.example.com/Videos/abc/main.m3u8?x=1')
    expect(segs.map((s) => [s.start, s.duration])).toEqual([
      [0, 3],
      [3, 3],
      [6, 2.5],
    ])
    expect(segs[1].url).toBe('https://jf.example.com/Videos/abc/hls1/main/1.ts?MediaSourceId=abc&runtimeTicks=30000000')
  })

  it('finds the segment holding a time', () => {
    const segs = parseMediaPlaylist(MEDIA, BASE)
    expect(segmentAt(segs, 0)).toBe(0)
    expect(segmentAt(segs, 2.99)).toBe(0)
    expect(segmentAt(segs, 3)).toBe(1)
    expect(segmentAt(segs, 7)).toBe(2)
    expect(segmentAt(segs, 999)).toBe(2)
  })

  it('carries the start position in the fragment', () => {
    const u = withStart(BASE, 125.5)
    expect(u).toBe(`${BASE}#t=125.5`)
    expect(splitStart(u)).toEqual({ url: BASE, start: 125.5 })
    expect(splitStart(BASE)).toEqual({ url: BASE, start: 0 })
  })
})

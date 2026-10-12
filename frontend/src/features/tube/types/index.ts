import type { components } from '@/lib/api/schema'

type S = components['schemas']

export type VideoCard = S['TubeVideoCardOut']
export type ChannelCard = S['TubeChannelCardOut']
export type PlaylistCard = S['TubePlaylistCardOut']
export type Home = S['TubeHomeOut']
export type SearchResults = S['TubeSearchOut']
export type VideoPage = S['TubeVideoOut']
export type ChannelPage = S['TubeChannelOut']
export type PlaylistPage = S['TubePlaylistOut']
export type Chapter = S['TubeChapterOut']
export type SearchKind = S['SearchKind']
export type LinkTarget = S['TubeLinkOut']

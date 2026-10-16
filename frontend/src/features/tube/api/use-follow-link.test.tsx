import { renderHook } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'

import { createWrapper } from '@/test/render'

import { NotFollowableLinkError, useFollowLink } from './use-library'

const followed: string[] = []
const server = setupServer(
  http.get('*/api/tube/link', ({ request }) => {
    const url = new URL(request.url).searchParams.get('url') ?? ''
    if (url.includes('list=')) return HttpResponse.json({ kind: 'playlist', id: 'PLcar' })
    if (url.includes('/@')) return HttpResponse.json({ kind: 'channel', id: '@Blender' })
    if (url.includes('watch')) return HttpResponse.json({ kind: 'video', id: 'aqz-KE-bpKQ' })
    return HttpResponse.json({ detail: 'not a YouTube link' }, { status: 422 })
  }),
  http.put('*/api/tube/playlists/:id/follow', ({ params }) => {
    followed.push(`playlist:${params.id}`)
    return HttpResponse.json({ id: params.id, title: 'Car list' })
  }),
  http.put('*/api/tube/channels/:id/follow', ({ params }) => {
    followed.push(`channel:${params.id}`)
    return HttpResponse.json({ id: 'UCx', name: 'Blender' })
  }),
)
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

it('follows a pasted playlist or channel link, and refuses anything else', async () => {
  const { result } = renderHook(() => useFollowLink(), { wrapper: createWrapper() })
  expect(await result.current.mutateAsync('https://www.youtube.com/playlist?list=PLcar')).toEqual({ kind: 'playlist', title: 'Car list' })
  expect(await result.current.mutateAsync('https://www.youtube.com/@Blender')).toEqual({ kind: 'channel', title: 'Blender' })
  await expect(result.current.mutateAsync('https://www.youtube.com/watch?v=aqz-KE-bpKQ')).rejects.toBeInstanceOf(NotFollowableLinkError)
  await expect(result.current.mutateAsync('hello')).rejects.toBeInstanceOf(NotFollowableLinkError)
  expect(followed).toEqual(['playlist:PLcar', 'channel:@Blender'])
})

import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'

import { ApiError } from '@/lib/api/client'
import { createWrapper } from '@/test/render'

import { useSearch, useVideo } from './use-browse'

const server = setupServer(
  http.get('*/api/tube/search', ({ request }) => {
    const url = new URL(request.url)
    return HttpResponse.json({ videos: [{ id: 'aqz-KE-bpKQ', title: url.searchParams.get('q'), is_live: false }], channels: [], playlists: [] })
  }),
  http.get('*/api/tube/videos/:id', () => HttpResponse.json({ detail: '[youtube] gone: This video is unavailable' }, { status: 404 })),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

it('searches only once there is something to search for', async () => {
  const { result, rerender } = renderHook(({ q }) => useSearch(q, 'videos'), { wrapper: createWrapper(), initialProps: { q: '' } })
  expect(result.current.fetchStatus).toBe('idle')
  rerender({ q: 'bunny' })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data?.videos[0].title).toBe('bunny')
})

it("passes YouTube's reason through when a video is gone", async () => {
  const { result } = renderHook(() => useVideo('xxxxxxxxxxx'), { wrapper: createWrapper() })
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error).toBeInstanceOf(ApiError)
  expect(result.current.error?.message).toContain('unavailable')
})

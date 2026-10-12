import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'

import { createWrapper } from '@/test/render'

import { useHome, useFollow } from './use-library'

const card = { id: 'aqz-KE-bpKQ', title: 'Big Buck Bunny', channel_name: 'Blender', duration_seconds: 635, position_seconds: 120, is_live: false }
let following = false
const server = setupServer(
  http.get('*/api/tube/home', () =>
    HttpResponse.json({ continue_watching: [card], feed: [], later: [], following: following ? [{ id: 'UCx', name: 'Blender' }] : [] }),
  ),
  http.put('*/api/tube/channels/:id/follow', () => {
    following = true
    return HttpResponse.json({ id: 'UCx', name: 'Blender' })
  }),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

it('loads the home screen and refreshes it after following a channel', async () => {
  const { result } = renderHook(() => ({ home: useHome(), follow: useFollow('UCx') }), { wrapper: createWrapper() })
  await waitFor(() => expect(result.current.home.isSuccess).toBe(true))
  expect(result.current.home.data?.continue_watching[0].position_seconds).toBe(120)
  expect(result.current.home.data?.following).toEqual([])
  await act(() => result.current.follow.mutateAsync(true))
  await waitFor(() => expect(result.current.home.data?.following).toHaveLength(1))
})

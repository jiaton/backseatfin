import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'

import { ApiError } from '@/lib/api/client'
import { createWrapper } from '@/test/render'

import { useAddSource, useSources } from './use-sources'

const source = {
  id: 1,
  url: 'https://www.youtube.com/playlist?list=X',
  title: 'Car',
  enabled: true,
  last_synced_at: null,
  last_error: null,
  created_at: '2026-09-27T00:00:00Z',
}

const server = setupServer(
  http.get('*/api/youtube/sources', () => HttpResponse.json([source])),
  http.post('*/api/youtube/sources', async ({ request }) => {
    const body = (await request.json()) as { url: string }
    if (body.url.includes('private')) {
      return HttpResponse.json({ detail: 'cannot read that playlist: private' }, { status: 422 })
    }
    return HttpResponse.json({ ...source, url: body.url }, { status: 201 })
  }),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

it('lists sources', async () => {
  const { result } = renderHook(() => useSources(), { wrapper: createWrapper() })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toEqual([source])
})

it('surfaces the backend detail message as an ApiError', async () => {
  const { result } = renderHook(() => useAddSource(), { wrapper: createWrapper() })
  result.current.mutate('https://www.youtube.com/playlist?list=private')
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error).toBeInstanceOf(ApiError)
  expect((result.current.error as ApiError).status).toBe(422)
  expect(result.current.error?.message).toBe('cannot read that playlist: private')
})

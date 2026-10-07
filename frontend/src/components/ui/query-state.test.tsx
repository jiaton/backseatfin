import { useQuery } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'

import { createWrapper } from '@/test/render'

import { QueryState } from './query-state'

function Harness({ fn, enabled = true }: { fn: () => Promise<string>; enabled?: boolean }) {
  const query = useQuery({ queryKey: ['t', String(fn)], queryFn: fn, enabled, retry: false })
  return (
    <QueryState query={query} empty={<p>idle</p>}>
      {(data) => <p>data:{data}</p>}
    </QueryState>
  )
}

it('shows loading, then the data', async () => {
  render(<Harness fn={() => Promise.resolve('ok')} />, { wrapper: createWrapper() })
  expect(screen.getByRole('status')).toBeTruthy()
  expect(await screen.findByText('data:ok')).toBeTruthy()
})

it('shows the error message', async () => {
  render(<Harness fn={() => Promise.reject(new Error('nope'))} />, { wrapper: createWrapper() })
  expect((await screen.findByRole('alert')).textContent).toContain('nope')
})

it('treats a disabled query as idle, not loading', () => {
  render(<Harness fn={() => Promise.resolve('x')} enabled={false} />, { wrapper: createWrapper() })
  expect(screen.getByText('idle')).toBeTruthy()
  expect(screen.queryByRole('status')).toBeNull()
})

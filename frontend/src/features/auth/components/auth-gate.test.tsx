import { useQuery } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'

import { api, unwrap } from '@/lib/api/client'
import { createWrapper } from '@/test/render'

import { AuthGate } from './auth-gate'

let signedIn = true
let pairingPolls = 0
const server = setupServer(
  http.get('*/api/auth/session', () =>
    HttpResponse.json(signedIn ? { authenticated: true, via: 'device', device_id: 1, device_name: 'Tesla' } : { authenticated: false }),
  ),
  http.get('*/api/tube/history', () =>
    signedIn ? HttpResponse.json([]) : HttpResponse.json({ detail: 'not authenticated' }, { status: 401 }),
  ),
  http.post('*/api/auth/pairings', () =>
    HttpResponse.json({ pairing_id: 'pid', code: '482913', expires_at: '2099-01-01T00:00:00Z' }, { status: 201 }),
  ),
  http.get('*/api/auth/pairings/pid', () => {
    pairingPolls++
    // Approved on the second poll: the real response sets the cookie; here we flip state.
    if (pairingPolls >= 2) signedIn = true
    return HttpResponse.json({ status: pairingPolls >= 2 ? 'approved' : 'pending' })
  }),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  signedIn = true
  pairingPolls = 0
})
afterAll(() => server.close())

function Protected() {
  const q = useQuery({ queryKey: ['tube', 'history'], queryFn: () => unwrap(api.GET('/api/tube/history')) })
  return <p>protected:{q.status}</p>
}

it('shows the pairing code when signed out, then lets the device in once approved', async () => {
  signedIn = false
  render(
    <AuthGate>
      <p>inside</p>
    </AuthGate>,
    { wrapper: createWrapper() },
  )
  expect(await screen.findByText('482913')).toBeTruthy()
  expect(screen.getByRole('img', { name: /scan/i })).toBeTruthy()
  expect(await screen.findByText('inside', {}, { timeout: 6000 })).toBeTruthy()
}, 10000)

it('drops back to sign-in when any request comes back 401', async () => {
  render(
    <AuthGate>
      <Protected />
    </AuthGate>,
    { wrapper: createWrapper() },
  )
  expect(await screen.findByText('protected:success')).toBeTruthy()
  signedIn = false
  // Simulate the cookie being revoked: the next protected request 401s.
  const { rerender } = render(
    <AuthGate>
      <Protected />
    </AuthGate>,
    { wrapper: createWrapper() },
  )
  rerender(
    <AuthGate>
      <Protected />
    </AuthGate>,
  )
  expect((await screen.findAllByText('Sign in with a setup code')).length).toBeGreaterThan(0)
})

it('logout returns to sign-in immediately', async () => {
  server.use(http.post('*/api/auth/logout', () => new HttpResponse(null, { status: 204 })))
  const { LogoutButton } = await import('./logout-button')
  render(
    <AuthGate>
      <LogoutButton />
    </AuthGate>,
    { wrapper: createWrapper() },
  )
  ;(await screen.findByRole('button', { name: 'Sign out' })).click()
  expect(await screen.findByText('482913')).toBeTruthy()
})

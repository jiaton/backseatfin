import { afterEach, expect, it, vi } from 'vitest'

import { goBack, isAppPath, navigate } from './router'

afterEach(() => window.history.replaceState(null, '', '/'))

it('navigates in place and goes home when there is nothing of ours to go back to', () => {
  const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
  goBack()
  expect(back).not.toHaveBeenCalled()
  expect(window.location.pathname).toBe('/')
  navigate('/v/aqz-KE-bpKQ')
  expect(window.location.pathname).toBe('/v/aqz-KE-bpKQ')
  goBack()
  expect(back).toHaveBeenCalledOnce()
})

it('treats only same-app paths as app paths', () => {
  expect(isAppPath('/v/x')).toBe(true)
  expect(isAppPath('//evil.example.com')).toBe(false)
  expect(isAppPath('https://evil.example.com')).toBe(false)
})

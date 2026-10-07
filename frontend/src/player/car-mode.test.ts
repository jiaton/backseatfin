import { expect, it } from 'vitest'

import { CAR_MODE_KEY as INJECT_KEY } from '@/inject/parse'

import { CAR_MODE_KEY } from './car-mode'

it('uses the same car-mode key as inject.js', () => {
  expect(CAR_MODE_KEY).toBe(INJECT_KEY)
  expect(document.querySelector('main button')?.textContent).toBe('Turn on')
})

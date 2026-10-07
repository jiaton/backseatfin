import { expect, it } from 'vitest'

import { RateCounter } from './probe-stats'

it('reports ticks per second since the previous sample', () => {
  const c = new RateCounter(0)
  for (let i = 0; i < 30; i++) c.tick()
  expect(c.sample(1000)).toBe(30)
  for (let i = 0; i < 15; i++) c.tick()
  expect(c.sample(3000)).toBe(7.5)
  expect(c.total).toBe(45)
})

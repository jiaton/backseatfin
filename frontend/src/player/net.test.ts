import { describe, expect, it } from 'vitest'

import { wsUrl } from './net'

describe('wsUrl', () => {
  it('upgrades https pages to wss on the same host', () => {
    expect(wsUrl('/api/stream/ws?source=test', { protocol: 'https:', host: 'admin.example.com' }, '')).toBe(
      'wss://admin.example.com/api/stream/ws?source=test',
    )
  })

  it('keeps the /car prefix on the Emby host', () => {
    expect(wsUrl('/api/stream/ws', { protocol: 'https:', host: 'car.example.com' }, '/car')).toBe(
      'wss://car.example.com/car/api/stream/ws',
    )
  })

  it('uses plain ws on http (local dev)', () => {
    expect(wsUrl('/x', { protocol: 'http:', host: 'localhost:5173' }, '')).toBe('ws://localhost:5173/x')
  })
})

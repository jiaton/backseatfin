import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'

import { QrCode } from './qr-code'

it('renders an accessible SVG with a non-trivial module path', () => {
  render(<QrCode value="https://admin.example.com/pair?code=123456" label="Pairing QR code" />)
  const svg = screen.getByRole('img', { name: 'Pairing QR code' })
  const d = svg.querySelector('path')?.getAttribute('d') ?? ''
  expect(d.split('M').length).toBeGreaterThan(200)
  expect(svg.getAttribute('viewBox')).toMatch(/^0 0 \d+ \d+$/)
})

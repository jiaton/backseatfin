import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'

import { createWrapper } from '@/test/render'

import { VideoCard } from './video-card'

it('links to the video and shows its length and how much is left', () => {
  const Wrapper = createWrapper()
  render(
    <Wrapper>
      <VideoCard video={{ id: 'aqz-KE-bpKQ', title: 'Big Buck Bunny', channel_name: 'Blender', duration_seconds: 635, position_seconds: 35, is_live: false, thumbnail_url: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg' }} />
    </Wrapper>,
  )
  expect(screen.getByRole('link').getAttribute('href')).toBe('/v/aqz-KE-bpKQ')
  expect(screen.getByText('10:35')).toBeTruthy()
  expect(screen.getByText('Blender · 10:00 left')).toBeTruthy()
})

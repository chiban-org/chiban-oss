// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NotFoundPage as NotFound } from './NotFoundPage'

afterEach(cleanup)

describe('not found page', () => {
  it('sits in the public shell so text is at least 16px', () => {
    const { container } = render(<NotFound />)
    expect(container.querySelector('.public-shell')).not.toBeNull()
  })

  it('links home and to parcel lookup', () => {
    render(<NotFound />)
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to the home page' }).getAttribute('href')).toBe('/')
    expect(screen.getByRole('link', { name: 'Look up a parcel' }).getAttribute('href')).toBe(
      '/parcels',
    )
  })
})

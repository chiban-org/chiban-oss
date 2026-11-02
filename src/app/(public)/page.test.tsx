// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import HomePage from './page'

afterEach(cleanup)

describe('HomePage', () => {
  it('links to parcel lookup', () => {
    render(<HomePage />)
    expect(screen.getByRole('link', { name: 'Look up a parcel' }).getAttribute('href')).toBe(
      '/parcels',
    )
  })
})

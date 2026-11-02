// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HomeContent } from '@/components/public/HomeContent'

afterEach(cleanup)

describe('HomeContent', () => {
  it('links to parcel lookup', () => {
    render(<HomeContent audience="visitor" />)
    expect(screen.getByRole('link', { name: 'Look up a parcel' }).getAttribute('href')).toBe(
      '/parcels',
    )
  })

  it('asks a visitor to sign in', () => {
    render(<HomeContent audience="visitor" />)
    expect(screen.getByRole('link', { name: 'Sign in to see your applications' })).toBeTruthy()
  })

  it('shows a signed-in resident their applications instead of a sign-in link', () => {
    render(<HomeContent audience="resident" />)
    expect(screen.queryByText('Sign in to see your applications')).toBeNull()
    expect(screen.getByRole('link', { name: 'Your applications' }).getAttribute('href')).toBe(
      '/account',
    )
  })

  it('sends signed-in staff to the staff site', () => {
    render(<HomeContent audience="staff" />)
    expect(screen.queryByText('Sign in to see your applications')).toBeNull()
    expect(screen.getByRole('link', { name: 'Open the staff site' }).getAttribute('href')).toBe(
      '/staff',
    )
  })
})

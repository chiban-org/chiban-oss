// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { HomeContent } from '@/components/public/HomeContent'

afterEach(cleanup)

function renderHome(props: Partial<ComponentProps<typeof HomeContent>> = {}) {
  render(
    <HomeContent
      audience="visitor"
      townName="Town of Birch Hollow"
      example={{ address: '12 Tamarack Way', displayId: '007001000000' }}
      {...props}
    />,
  )
}

describe('HomeContent', () => {
  it('names the town from its settings', () => {
    renderHome()
    expect(screen.getByRole('heading', { level: 1, name: 'Town of Birch Hollow' })).toBeTruthy()
  })

  it('searches parcels with the same form as the parcels page, with an example to try', () => {
    renderHome()
    const search = screen.getByRole('search')
    expect(search.getAttribute('action')).toBe('/parcels')
    expect(screen.getByLabelText('Find a parcel by ID, address, or owner')).toBeTruthy()
    expect(screen.getByRole('link', { name: '12 Tamarack Way' }).getAttribute('href')).toBe(
      '/parcels?q=12%20Tamarack%20Way',
    )
  })

  it('uses the same names as the navigation', () => {
    renderHome()
    expect(screen.getByRole('link', { name: 'Meetings' }).getAttribute('href')).toBe('/meetings')
    expect(screen.getByRole('link', { name: 'Report a problem' }).getAttribute('href')).toBe(
      '/complaints/new',
    )
    expect(screen.getByRole('link', { name: 'Apply for a permit' }).getAttribute('href')).toBe(
      '/portal/apply',
    )
  })

  it('asks a visitor to sign in', () => {
    renderHome()
    expect(screen.getByRole('link', { name: 'Sign in to see your applications' })).toBeTruthy()
  })

  it('shows a signed-in resident their applications instead of a sign-in link', () => {
    renderHome({ audience: 'resident' })
    expect(screen.queryByText('Sign in to see your applications')).toBeNull()
    expect(screen.getByRole('link', { name: 'Your applications' }).getAttribute('href')).toBe(
      '/portal',
    )
  })

  it('offers a board member their board first', () => {
    renderHome({ audience: 'resident', boardMember: true })
    expect(screen.getByRole('link', { name: 'Your board' }).getAttribute('href')).toBe('/board')
    expect(screen.getByRole('link', { name: 'Your applications' })).toBeTruthy()
  })

  it('offers no board link to a resident who is not on a board', () => {
    renderHome({ audience: 'resident' })
    expect(screen.queryByRole('link', { name: 'Your board' })).toBeNull()
  })

  it('sends signed-in staff to the staff site', () => {
    renderHome({ audience: 'staff' })
    expect(screen.queryByText('Sign in to see your applications')).toBeNull()
    expect(screen.getByRole('link', { name: 'Staff site' }).getAttribute('href')).toBe('/staff')
  })
})

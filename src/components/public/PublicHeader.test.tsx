// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { PublicHeader } from '@/components/public/PublicHeader'

afterEach(cleanup)

function renderHeader(signedIn: boolean) {
  render(
    <CsrfProvider token="t">
      <PublicHeader signedIn={signedIn} signOutAction={() => Promise.resolve()} />
    </CsrfProvider>,
  )
}

describe('PublicHeader', () => {
  it('offers sign in when nobody is signed in', () => {
    renderHeader(false)
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/sign-in')
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
  })

  it('shows the account link and sign out once signed in, with no sign in link', () => {
    renderHeader(true)
    expect(screen.getByRole('link', { name: 'Your applications' }).getAttribute('href')).toBe(
      '/portal',
    )
    expect(screen.getByRole('link', { name: 'Contractor projects' }).getAttribute('href')).toBe(
      '/portal/contractor',
    )
    expect(screen.getByRole('link', { name: 'Parcel lookup' }).getAttribute('href')).toBe(
      '/parcels',
    )
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
  })
})

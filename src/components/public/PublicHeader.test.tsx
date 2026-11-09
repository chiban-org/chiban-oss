// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { PublicHeader } from '@/components/public/PublicHeader'
import type { NavViewer } from '@/features/publicSite/publicNav'
import type { PublicTown } from '@/features/town/publicTown'

const nav = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))

afterEach(cleanup)
beforeEach(() => {
  nav.pathname = '/'
})

const TOWN: PublicTown = {
  name: 'Town of Birch Hollow',
  office: {
    officeName: 'Land Use Office',
    addressLines: [],
    phone: '',
    email: '',
    officeHours: '',
  },
  logo: { src: '/town-logo/abc.png', width: 40, height: 40 },
}

function renderHeader(viewer: NavViewer | null, town: PublicTown = TOWN) {
  render(
    <CsrfProvider token="t">
      <PublicHeader town={town} viewer={viewer} signOutAction={() => Promise.resolve()} />
    </CsrfProvider>,
  )
}

const accountNav = () => screen.getByRole('navigation', { name: 'Account' })
const linkNames = (scope: HTMLElement) =>
  within(scope)
    .getAllByRole('link')
    .map((a) => a.textContent)

describe('PublicHeader', () => {
  it('names the town from its settings and shows its seal, linking home', () => {
    renderHeader(null)
    const home = screen.getByRole('link', { name: /Town of Birch Hollow/ })
    expect(home.getAttribute('href')).toBe('/')
    expect(home.querySelector('img')?.getAttribute('src')).toBe('/town-logo/abc.png')
  })

  it('leaves the seal out when the profile has none', () => {
    renderHeader(null, { ...TOWN, logo: null })
    expect(
      screen.getByRole('link', { name: 'Town of Birch Hollow' }).querySelector('img'),
    ).toBeNull()
  })

  it('offers the main tasks to everyone, with applying for a permit set apart', () => {
    renderHeader(null)
    const main = screen.getByRole('navigation', { name: 'Main' })
    expect(linkNames(main)).toEqual([
      'Parcels',
      'Meetings',
      'Report a problem',
      'Apply for a permit',
    ])
    expect(
      within(main).getByRole('link', { name: 'Apply for a permit' }).getAttribute('data-emphasis'),
    ).toBe('')
  })

  it('offers only sign in when nobody is signed in', () => {
    renderHeader(null)
    expect(linkNames(accountNav())).toEqual(['Sign in'])
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
  })

  it('gives a resident their applications, account and sign out', () => {
    renderHeader({ kind: 'public', roles: ['applicant'] })
    expect(linkNames(accountNav())).toEqual(['Your applications', 'Account'])
    expect(within(accountNav()).getByRole('button', { name: 'Sign out' })).toBeTruthy()
  })

  it('gives staff a way back to the staff site', () => {
    renderHeader({ kind: 'staff', roles: ['staff'] })
    expect(
      within(accountNav()).getByRole('link', { name: 'Staff site' }).getAttribute('href'),
    ).toBe('/staff')
  })

  it('marks the current page', () => {
    nav.pathname = '/parcels/123'
    renderHeader(null)
    expect(screen.getByRole('link', { name: 'Parcels' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Meetings' }).getAttribute('aria-current')).toBeNull()
  })

  it('folds the links behind a Menu button that Escape closes, returning focus to it', () => {
    renderHeader({ kind: 'public', roles: ['applicant'] })
    const button = screen.getByRole('button', { name: 'Menu' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    const panel = document.getElementById(button.getAttribute('aria-controls') ?? '')
    expect(panel?.contains(accountNav())).toBe(true)
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    const parcels = screen.getByRole('link', { name: 'Parcels' })
    act(() => {
      parcels.focus()
    })
    fireEvent.keyDown(parcels, { key: 'Escape' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(button)
  })

  it('offers no sign in on a private packet link, since outside recipients have no account', () => {
    nav.pathname = '/board/packets/some-token'
    renderHeader(null)
    expect(screen.queryByRole('navigation', { name: 'Account' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
  })
})

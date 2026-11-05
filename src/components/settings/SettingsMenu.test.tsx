// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SettingsMenuSection } from '@/features/settingsMenu/settingsMenu'

const nav = vi.hoisted(() => ({ path: '/staff/settings/form' }))

vi.mock('next/navigation', () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ push: vi.fn() }),
}))

const { SettingsMenu } = await import('./SettingsMenu')

afterEach(() => {
  cleanup()
  nav.path = '/staff/settings/form'
})

const SECTIONS: SettingsMenuSection[] = [
  {
    key: 'town',
    label: 'Town',
    items: [
      { href: '/staff/settings/town-profile', label: 'Town profile' },
      { href: '/staff/settings/letterhead', label: 'Letterhead' },
    ],
  },
  {
    key: 'permits',
    label: 'Permits',
    items: [
      { href: '/staff/settings/application_type', label: 'Application types' },
      { href: '/staff/settings/form', label: 'Forms' },
    ],
  },
]

function menu() {
  render(<SettingsMenu sections={SECTIONS} />)
  return screen.getByRole('navigation', { name: 'Settings' })
}

describe('settings menu', () => {
  it('opens only the group holding the current page', () => {
    const nav = menu()
    expect(within(nav).getByRole('link', { name: 'Forms' })).toBeTruthy()
    expect(within(nav).queryByRole('link', { name: 'Letterhead' })).toBeNull()
    expect(within(nav).getByRole('button', { name: /Town/ }).getAttribute('aria-expanded')).toBe(
      'false',
    )
  })

  it('opens another group from its heading', () => {
    const nav = menu()
    fireEvent.click(within(nav).getByRole('button', { name: /Town/ }))
    expect(within(nav).getByRole('link', { name: 'Letterhead' })).toBeTruthy()
  })

  it('closes the current group from its heading too', () => {
    const nav = menu()
    fireEvent.click(within(nav).getByRole('button', { name: /Permits/ }))
    expect(within(nav).queryByRole('link', { name: 'Forms' })).toBeNull()
  })

  it('keeps a group the user opened open after moving to a page inside it', () => {
    const { rerender } = render(<SettingsMenu sections={SECTIONS} />)
    const menuNav = screen.getByRole('navigation', { name: 'Settings' })
    fireEvent.click(within(menuNav).getByRole('button', { name: /Town/ }))
    nav.path = '/staff/settings/letterhead'
    rerender(<SettingsMenu sections={SECTIONS} />)
    expect(
      within(menuNav).getByRole('button', { name: /Town/ }).getAttribute('aria-expanded'),
    ).toBe('true')
    expect(within(menuNav).getByRole('link', { name: 'Letterhead' })).toBeTruthy()
  })

  it('opens the group of a page reached from elsewhere and keeps the earlier group open', () => {
    const { rerender } = render(<SettingsMenu sections={SECTIONS} />)
    const menuNav = screen.getByRole('navigation', { name: 'Settings' })
    nav.path = '/staff/settings/town-profile'
    rerender(<SettingsMenu sections={SECTIONS} />)
    expect(within(menuNav).getByRole('link', { name: 'Letterhead' })).toBeTruthy()
    expect(within(menuNav).getByRole('link', { name: 'Forms' })).toBeTruthy()
  })

  it('shows every match across groups while filtering', () => {
    const nav = menu()
    fireEvent.change(within(nav).getByRole('searchbox'), { target: { value: 'letter' } })
    expect(within(nav).getByRole('link', { name: 'Letterhead' })).toBeTruthy()
    expect(within(nav).queryByRole('link', { name: 'Forms' })).toBeNull()
  })
})

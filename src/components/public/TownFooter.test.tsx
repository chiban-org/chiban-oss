// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TownFooter } from '@/components/public/TownFooter'
import type { PublicTown } from '@/features/town/publicTown'

afterEach(cleanup)

const TOWN: PublicTown = {
  name: 'Town of Birch Hollow',
  office: {
    officeName: 'Land Use Office',
    addressLines: ['Birch Hollow Town Hall', '1 Main Street'],
    phone: '603-555-0100',
    email: 'landuse@birch.example',
    officeHours: 'Monday to Thursday, 8 to 4',
  },
  logo: null,
}

describe('TownFooter', () => {
  it('shows the office name, address, phone, email and hours from the town profile', () => {
    render(<TownFooter town={TOWN} />)
    const footer = screen.getByRole('contentinfo')
    expect(footer.textContent).toContain('Land Use Office')
    expect(footer.textContent).toContain('Birch Hollow Town Hall')
    expect(footer.textContent).toContain('1 Main Street')
    expect(screen.getByRole('link', { name: '603-555-0100' }).getAttribute('href')).toBe(
      'tel:6035550100',
    )
    expect(screen.getByRole('link', { name: 'landuse@birch.example' }).getAttribute('href')).toBe(
      'mailto:landuse@birch.example',
    )
    expect(footer.textContent).toContain('Hours: Monday to Thursday, 8 to 4')
  })

  it('leaves out each line whose field is empty', () => {
    render(
      <TownFooter
        town={{ ...TOWN, office: { ...TOWN.office, phone: '', email: '', officeHours: '' } }}
      />,
    )
    const footer = screen.getByRole('contentinfo')
    expect(screen.queryByRole('link')).toBeNull()
    expect(footer.textContent).not.toContain('Hours')
    expect(footer.textContent).not.toContain('Phone')
    expect(footer.textContent).not.toContain('Email')
  })
})

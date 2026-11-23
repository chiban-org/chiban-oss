// @vitest-environment jsdom
import { ME_PACK } from '@packs/me'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setActivePackForTest } from '@/features/packs/registry'
import { Holidays } from './Holidays'

afterEach(cleanup)
beforeAll(() => setActivePackForTest(ME_PACK))
afterAll(() => setActivePackForTest(null))

describe('Holidays', () => {
  it('lists Thanksgiving for the current year and the next', () => {
    render(<Holidays year={2027} />)
    const section = screen.getByRole('region', { name: 'Holidays Chiban skips' })
    expect(within(section).getByText('November 25, 2027')).toBeTruthy()
    expect(within(section).getAllByText(/^Thanksgiving/).length).toBe(2)
    expect(within(section).getByText('November 23, 2028')).toBeTruthy()
  })

  it('gives each holiday its citation', () => {
    render(<Holidays year={2027} />)
    const section = screen.getByRole('region', { name: 'Holidays Chiban skips' })
    const rows = within(section).getAllByRole('row').slice(1)
    expect(rows.length).toBeGreaterThan(10)
    for (const row of rows) {
      const cells = within(row).getAllByRole('cell')
      expect(cells).toHaveLength(3)
      expect(cells[2]?.textContent.trim()).not.toBe('')
    }
  })
})

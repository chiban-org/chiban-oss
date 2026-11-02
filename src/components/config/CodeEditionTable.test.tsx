// @vitest-environment jsdom

import { NH_CODE_EDITIONS } from '@packs/nh/codeEditions'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CodeEditionTable } from '@/components/config/CodeEditionTable'
import { findIsoDates } from '@/test/leaks'

afterEach(cleanup)

describe('CodeEditionTable', () => {
  it('says plainly that the period before July 1, 2024 is not verified', () => {
    render(<CodeEditionTable editions={NH_CODE_EDITIONS} />)
    const row = screen
      .getByText('Edition not verified (before July 1, 2024)')
      .closest('tr') as HTMLElement
    expect(within(row).getByText('Not verified')).toBeTruthy()
    expect(within(row).getByText(/Chiban does not know which codes applied/)).toBeTruthy()
  })

  it('lists the adopted codes, enforcement date, and amendment packages for the verified edition', () => {
    render(<CodeEditionTable editions={NH_CODE_EDITIONS} />)
    const row = screen.getByText(/NEC 2023 \(effective July 1, 2024\)/).closest('tr') as HTMLElement
    expect(within(row).getByText('Verified')).toBeTruthy()
    expect(within(row).getByText(/Enforced from January 1, 2025/)).toBeTruthy()
    expect(
      within(row).queryByText(
        'IBC 2021, IEBC 2021, IPC 2021, IMC 2021, IECC 2018, IRC 2021, ISPSC 2021, NEC 2023',
      ),
    ).toBeNull()
    expect(within(row).getByText(/July 1, 2025/)).toBeTruthy()
    expect(within(row).getByText(/October 15, 2025/)).toBeTruthy()
    expect(
      within(row).getByRole('link', { name: 'RSA 155-A:1 IV' }).getAttribute('href'),
    ).toContain('155-A-1')
  })

  it('shows the epoch sentinel as the start of records', () => {
    render(<CodeEditionTable editions={NH_CODE_EDITIONS} />)
    expect(screen.getByText('Start of records')).toBeTruthy()
    expect(screen.queryByText(/1970/)).toBeNull()
  })

  it('prints no ISO date anywhere in the table', () => {
    const { container } = render(<CodeEditionTable editions={NH_CODE_EDITIONS} />)
    expect(findIsoDates(container.textContent)).toEqual([])
  })
})

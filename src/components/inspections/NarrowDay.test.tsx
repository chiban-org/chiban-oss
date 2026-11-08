// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DANA, IRA, renderBoard } from '@/test/scheduleBoardFixtures'

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('1023'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const days = () => screen.getByRole('group', { name: 'Days' })

describe('the board on a narrow screen', () => {
  it('shows a day switcher for the week and no grid', () => {
    renderBoard()
    expect(screen.queryByRole('table')).toBeNull()
    expect(
      within(days())
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Tue, Jul 6Today', 'Wed, Jul 7', 'Thu, Jul 8', 'Fri, Jul 9'])
  })

  it('stacks one block per inspector for the chosen day with the same cell content', () => {
    renderBoard()
    fireEvent.click(within(days()).getByRole('button', { name: /Jul 7/ }))
    const dana = screen.getByRole('listitem', { name: DANA.name })
    expect(within(dana).getAllByRole('button', { name: /^Move / })).toHaveLength(2)
    const ira = screen.getByRole('listitem', { name: IRA.name })
    expect(within(ira).getByRole('button', { name: /^3 open,/ })).toBeTruthy()
  })

  it('moves to the preferred day, focuses the prompt and books from the stacked block', () => {
    const onSchedule = renderBoard()
    fireEvent.click(screen.getByRole('button', { name: /Choose EL-2027-0001/ }))
    expect(document.activeElement).toBe(screen.getByTestId('choice-prompt'))
    expect(within(days()).getByRole('button', { name: /Jul 7/ }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    const ira = screen.getByRole('listitem', { name: IRA.name })
    fireEvent.click(within(ira).getByRole('button', { name: /^3 open,/ }))
    fireEvent.click(within(ira).getByRole('button', { name: /^9:30 AM, July 7, 2027/ }))
    fireEvent.click(
      within(within(ira).getByRole('group', { name: 'Review the booking' })).getByRole('button', {
        name: 'Book',
      }),
    )
    expect(onSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        inspectionId: 'i1',
        startMinute: 570,
        inspectorUserId: IRA.userId,
      }),
    )
  })
})

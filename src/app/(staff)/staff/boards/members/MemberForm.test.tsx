// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { MemberRow } from '@/features/boards/membersView'

vi.mock('./actions', () => ({ inviteMemberAction: vi.fn(), updateMemberAction: vi.fn() }))

const { AddMember, EditMember } = await import('./MemberForm')

afterEach(cleanup)

const row: MemberRow = {
  membershipId: '5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f',
  name: 'Avery Stone',
  email: 'avery@alderpond.example',
  board: 'zba',
  title: 'vice_chair',
  termStart: '2025-04-01',
  termEnd: '2028-03-31',
  boardName: 'Zoning Board of Adjustment',
  titleText: 'Vice chair',
  termText: 'April 1, 2025 to March 31, 2028',
  statusText: 'Active',
  active: true,
}

const BOARD_OPTIONS = [
  ['planning_board', 'Alder Pond Planning Board'],
  ['zba', 'Alder Pond Zoning Board of Adjustment'],
] as const

function value(label: string): string {
  return screen.getByLabelText<HTMLInputElement>(new RegExp(`^${label}( \\*)?$`)).value
}

describe('board member dialogs', () => {
  it('opens Edit filled in with the member as recorded', () => {
    render(
      <CsrfProvider token="t1">
        <EditMember row={row} today="2026-11-04" boards={BOARD_OPTIONS} />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit Avery Stone' }))
    const dialog = screen.getByRole('dialog')
    expect(value('Name')).toBe('Avery Stone')
    expect(value('Email address')).toBe('avery@alderpond.example')
    expect(value('Board')).toBe('zba')
    expect(value('Role on the board')).toBe('vice_chair')
    expect(value('Term starts')).toBe('2025-04-01')
    expect(value('Term ends')).toBe('2028-03-31')
    expect(dialog.querySelector<HTMLInputElement>('input[name="membershipId"]')?.value).toBe(
      row.membershipId,
    )
  })

  it('opens Add empty with the term starting today', () => {
    render(
      <CsrfProvider token="t1">
        <AddMember today="2026-11-04" boards={BOARD_OPTIONS} />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }))
    expect(screen.getByRole('heading', { name: 'Add a board member' })).toBeTruthy()
    expect(value('Name')).toBe('')
    expect(value('Term starts')).toBe('2026-11-04')
    expect(value('Term ends')).toBe('')
    const board = screen.getByLabelText<HTMLSelectElement>(/^Board( \*)?$/)
    expect(Array.from(board.options).map((o) => o.text)).toEqual([
      'Alder Pond Planning Board',
      'Alder Pond Zoning Board of Adjustment',
    ])
  })
})

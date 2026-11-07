// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { MemberRow } from '@/features/boards/membersView'

vi.mock('./actions', () => ({ inviteMemberAction: vi.fn(), updateMemberAction: vi.fn() }))

const { AddMember, EditMember } = await import('./MemberForm')
const { inviteMemberAction } = await import('./actions')

afterEach(cleanup)

const row: MemberRow = {
  membershipId: '5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f',
  name: 'Avery Stone',
  email: 'avery@alderpond.example',
  boardId: '22222222-2222-4222-8222-222222222222',
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
  ['11111111-1111-4111-8111-111111111111', 'Alder Pond Planning Board'],
  ['22222222-2222-4222-8222-222222222222', 'Alder Pond Zoning Board of Adjustment'],
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
    expect(value('Board')).toBe('22222222-2222-4222-8222-222222222222')
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

  it('shows a refused term end beside the Term ends field with its hint still described', async () => {
    vi.mocked(inviteMemberAction).mockResolvedValue({
      ok: false,
      error: 'The term cannot end before it starts.',
      fieldErrors: { termEnd: 'The term cannot end before it starts.' },
    })
    render(
      <CsrfProvider token="t1">
        <AddMember today="2026-11-04" boards={BOARD_OPTIONS} />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }))
    fireEvent.change(screen.getByLabelText(/^Name( \*)?$/), { target: { value: 'Avery Stone' } })
    fireEvent.change(screen.getByLabelText(/^Email address( \*)?$/), {
      target: { value: 'avery@alderpond.example' },
    })
    fireEvent.change(screen.getByLabelText(/^Term ends( \*)?$/), {
      target: { value: '2026-10-01' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add member' }).at(-1) as HTMLElement)
    const termEnd = screen.getByLabelText<HTMLInputElement>(/^Term ends( \*)?$/)
    await waitFor(() => expect(termEnd.getAttribute('aria-invalid')).toBe('true'))
    const described = (termEnd.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent)
    expect(described).toEqual([
      'Leave blank if there is no end date.',
      'The term cannot end before it starts.',
    ])
    expect(
      screen.getByLabelText<HTMLInputElement>(/^Term starts( \*)?$/).getAttribute('aria-invalid'),
    ).toBeNull()
  })
})

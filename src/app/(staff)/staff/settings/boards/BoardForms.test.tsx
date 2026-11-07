// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { BoardKindOption } from '@/features/boards/boardsAdminView'

vi.mock('./actions', () => ({
  addBoardAction: vi.fn(),
  renameBoardAction: vi.fn(),
  archiveBoardAction: vi.fn(),
}))

const { AddBoard, RenameBoard } = await import('./BoardForms')

afterEach(cleanup)

const KINDS: BoardKindOption[] = [
  {
    kind: 'planning_board',
    label: 'Planning Board',
    description: 'Decides site plans.',
    defaultShortName: 'Planning Board',
    disabledReason:
      'The town already has an active Planning Board. Archive it first to add another.',
  },
  {
    kind: 'conservation_commission',
    label: 'Conservation Commission',
    description: 'Advises on wetlands.',
    defaultShortName: 'Conservation Commission',
    disabledReason: null,
  },
  {
    kind: 'other',
    label: 'Other board or committee',
    description: 'Any other town body.',
    defaultShortName: 'Board',
    disabledReason: null,
  },
]

function openAdd() {
  render(
    <CsrfProvider token="t1">
      <AddBoard kinds={KINDS} />
    </CsrfProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Add a board' }))
}

function shortName(): string {
  return screen.getByLabelText<HTMLInputElement>(/^Short name/).value
}

describe('AddBoard', () => {
  it('lists every kind with its description and disables a taken kind with the reason', () => {
    openAdd()
    const planning = screen.getByRole('radio', { name: /Planning Board/ })
    expect(planning.hasAttribute('disabled')).toBe(true)
    expect(
      screen.getByText(
        'The town already has an active Planning Board. Archive it first to add another.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('Advises on wetlands.')).toBeTruthy()
    expect(
      screen.getByRole('radio', { name: /Conservation Commission/ }).hasAttribute('disabled'),
    ).toBe(false)
  })

  it('starts on the first available kind and carries its short name', () => {
    openAdd()
    expect(
      screen.getByRole('radio', { name: /Conservation Commission/ }).getAttribute('aria-checked'),
    ).toBe('true')
    expect(shortName()).toBe('Conservation Commission')
  })

  it('follows the kind with the short name until the short name is edited', () => {
    openAdd()
    fireEvent.click(screen.getByRole('radio', { name: /Other board or committee/ }))
    expect(shortName()).toBe('Board')
    fireEvent.change(screen.getByLabelText(/^Short name/), { target: { value: 'Trails' } })
    fireEvent.click(screen.getByRole('radio', { name: /Conservation Commission/ }))
    expect(shortName()).toBe('Trails')
  })
})

describe('RenameBoard', () => {
  it('opens filled in with the board name and short name', () => {
    render(
      <CsrfProvider token="t1">
        <RenameBoard
          boardId="5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f"
          name="Alder Pond Conservation Commission"
          shortName="Conservation Commission"
        />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit Alder Pond Conservation Commission' }))
    expect(screen.getByLabelText<HTMLInputElement>(/^Name/).value).toBe(
      'Alder Pond Conservation Commission',
    )
    expect(screen.getByLabelText<HTMLInputElement>(/^Short name/).value).toBe(
      'Conservation Commission',
    )
  })
})

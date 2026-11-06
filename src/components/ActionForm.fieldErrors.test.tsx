// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionForm } from '@/components/ActionForm'
import { CsrfProvider } from '@/components/CsrfProvider'
import { SelectField, TextField } from '@/components/staff/fields'
import type { ActionResult } from '@/server/actionRunner'

afterEach(cleanup)

const TITLE_REFUSED: ActionResult = {
  ok: false,
  error: 'Enter a title. Choose a board.',
  fieldErrors: { title: 'Enter a title.', board: 'Choose a board.' },
}

function renderForm(action: (formData: FormData) => Promise<ActionResult>) {
  render(
    <CsrfProvider token="t1">
      <ActionForm action={action} submitLabel="Add item">
        <TextField label="Title" name="title" hint="Shown on the agenda." />
        <SelectField
          label="Board"
          name="board"
          options={[
            ['zba', 'Zoning Board of Adjustment'],
            ['planning_board', 'Planning Board'],
          ]}
        />
        <TextField label="Details" name="details" />
      </ActionForm>
    </CsrfProvider>,
  )
}

function describedText(element: HTMLElement): string[] {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter((id) => id !== '')
    .map((id) => document.getElementById(id)?.textContent ?? `missing ${id}`)
}

describe('ActionForm with field-keyed refusals', () => {
  it('shows each message beside its field, marks it invalid and keeps its hint described', async () => {
    renderForm(() => Promise.resolve(TITLE_REFUSED))
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    const title = await screen.findByRole('textbox', { name: 'Title' })
    await waitFor(() => expect(title.getAttribute('aria-invalid')).toBe('true'))
    expect(describedText(title)).toEqual(['Shown on the agenda.', 'Enter a title.'])
    const titleField = title.closest('[data-slot="field"]')
    expect(titleField?.textContent).toContain('Enter a title.')
    const board = screen.getByRole('combobox', { name: 'Board' })
    expect(board.getAttribute('aria-invalid')).toBe('true')
    expect(describedText(board)).toEqual(['Choose a board.'])
    const details = screen.getByRole('textbox', { name: 'Details' })
    expect(details.getAttribute('aria-invalid')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Enter a title. Choose a board.')
  })

  it('moves focus to the first refused field', async () => {
    renderForm(() => Promise.resolve(TITLE_REFUSED))
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Title' })),
    )
  })

  it('clears the field messages once the person edits the form', async () => {
    renderForm(() => Promise.resolve(TITLE_REFUSED))
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    await screen.findByText('Enter a title.', { selector: '[data-slot="field"] p' })
    fireEvent.input(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Old business' },
    })
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: 'Title' }).getAttribute('aria-invalid'),
      ).toBeNull(),
    )
    expect(screen.queryByText('Enter a title.')).toBeNull()
  })

  it('still shows an action that returns only error in the status line and marks no field', async () => {
    renderForm(() => Promise.resolve({ ok: false, error: 'That record was not found.' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('That record was not found.'),
    )
    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0)
  })

  it('hides the previous error while the next submit is pending', async () => {
    let finish: (result: ActionResult) => void = () => undefined
    const action = vi
      .fn<(formData: FormData) => Promise<ActionResult>>()
      .mockResolvedValueOnce(TITLE_REFUSED)
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    renderForm(action)
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Enter a title. Choose a board.'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    await screen.findByRole('button', { name: 'Working' })
    expect(screen.getByRole('status').textContent).toBe('')
    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0)
    finish({ ok: true, message: 'Item added.' })
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Item added.'))
  })
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionForm } from '@/components/ActionForm'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { ConfirmStep } from '@/components/useConfirmStep'
import { CHECK_ONLY_FIELD } from '@/constants/formCheck'

afterEach(cleanup)

const CANCEL_MEETING: ConfirmStep = {
  title: 'Cancel the November 20 meeting?',
  body: 'Members and the public site will show it as cancelled.',
  confirmLabel: 'Cancel the meeting',
}

function renderForm(
  confirm: ConfirmStep = CANCEL_MEETING,
  fields: React.ReactNode = <input type="hidden" name="meetingId" value="m1" />,
) {
  const action = vi.fn((_: FormData) => Promise.resolve({ ok: true as const, message: 'Done.' }))
  render(
    <CsrfProvider token="t1">
      <ActionForm
        action={action}
        submitLabel="Cancel meeting"
        variant="destructive"
        confirm={confirm}
      >
        {fields}
      </ActionForm>
    </CsrfProvider>,
  )
  return action
}

async function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Cancel meeting' }))
  return await screen.findByRole('dialog')
}

function sent(action: ReturnType<typeof renderForm>): FormData[] {
  return action.mock.calls.map(([formData]) => formData).filter((f) => !f.has(CHECK_ONLY_FIELD))
}

describe('ActionForm with a confirm step', () => {
  it('opens a dialog naming what will happen instead of submitting', async () => {
    const action = renderForm()
    const dialog = await openDialog()
    expect(screen.getByRole('heading', { name: CANCEL_MEETING.title })).toBeTruthy()
    expect(dialog.getAttribute('aria-labelledby')).toBe(
      screen.getByRole('heading', { name: CANCEL_MEETING.title }).id,
    )
    const described = document.getElementById(dialog.getAttribute('aria-describedby') ?? '')
    expect(described?.textContent).toBe(CANCEL_MEETING.body)
    expect(sent(action)).toEqual([])
  })

  it('starts focus on Cancel and styles the confirm button as destructive', async () => {
    renderForm()
    await openDialog()
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    await waitFor(() => expect(document.activeElement).toBe(cancel))
    const confirm = screen.getByRole('button', { name: 'Cancel the meeting' })
    expect(confirm.getAttribute('data-variant')).toBe('destructive')
    expect(cancel.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('sends nothing when Cancel is pressed', async () => {
    const action = renderForm()
    await openDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(sent(action)).toEqual([])
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel meeting' })),
    )
  })

  it('sends nothing when Escape is pressed', async () => {
    const action = renderForm()
    const dialog = await openDialog()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(sent(action)).toEqual([])
  })

  it('submits the original form exactly once on confirm', async () => {
    const action = renderForm()
    await openDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel the meeting' }))
    await waitFor(() => expect(screen.getByText('Done.')).toBeTruthy())
    expect(sent(action).map((f) => f.get('meetingId'))).toEqual(['m1'])
  })

  it('asks for a missing reason before it asks for confirmation', async () => {
    const action = renderForm(
      CANCEL_MEETING,
      <label>
        Reason
        <input name="reason" required />
      </label>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel meeting' }))
    await waitFor(() => expect(screen.getByText('Fill in: Reason.')).toBeTruthy())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(action).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Snow' } })
    await openDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel the meeting' }))
    await waitFor(() => expect(sent(action)).toHaveLength(1))
    expect(sent(action)[0]?.get('reason')).toBe('Snow')
  })

  it('asks only when the chosen value is one the step names', async () => {
    const action = renderForm(
      { ...CANCEL_MEETING, when: { name: 'to', oneOf: ['closed'] } },
      <select name="to" aria-label="Move to" defaultValue="investigating">
        <option value="investigating">Investigating</option>
        <option value="closed">Closed</option>
      </select>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel meeting' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).toBeNull()
    await screen.findByText('Done.')
    fireEvent.change(screen.getByLabelText('Move to'), { target: { value: 'closed' } })
    await openDialog()
    expect(sent(action)).toHaveLength(1)
  })

  it('treats an unticked box as the empty value', async () => {
    const action = renderForm(
      { ...CANCEL_MEETING, when: { name: 'isPublic', oneOf: [''] } },
      <input type="checkbox" name="isPublic" value="true" aria-label="Public" defaultChecked />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel meeting' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    await screen.findByText('Done.')
    fireEvent.click(screen.getByLabelText('Public'))
    await openDialog()
    expect(sent(action)).toHaveLength(1)
  })
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { ChecklistForm } from '@/components/inspections/ChecklistForm'
import type { ActionResult } from '@/server/actionRunner'

afterEach(cleanup)

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
const success = vi.fn()
vi.mock('sonner', () => ({ toast: { success: (message: string) => void success(message) } }))

const items = [
  { key: 'a', label: 'Panel secured', required: true, outcome: null, note: '' },
  { key: 'b', label: 'Labels present', required: true, outcome: null, note: '' },
  { key: 'c', label: 'Photos taken', required: false, outcome: null, note: '' },
]

const CLOSING = {
  note: 'Passing this final closes permit EL-2026-0001.',
  confirm: 'This closes permit EL-2026-0001.',
}

function setup(
  action: Mock<(formData: FormData) => Promise<ActionResult>> = vi.fn(() =>
    Promise.resolve<ActionResult>({ ok: true, message: 'Recorded.' }),
  ),
  closing: typeof CLOSING | null = null,
) {
  render(
    <CsrfProvider token="t1">
      <ChecklistForm
        inspectionId="i1"
        rowVersion={3}
        items={items}
        action={action}
        initialNotes=""
        name="Final inspection"
        closing={closing}
      />
    </CsrfProvider>,
  )
  return action
}

async function recordAndConfirm(confirmLabel: 'Record as passed' | 'Record as failed') {
  fireEvent.click(screen.getByRole('button', { name: 'Record result' }))
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: confirmLabel }))
}

function choose(label: string, option: 'Pass' | 'Fail' | 'N/A') {
  const group = screen.getByRole('radiogroup', { name: label })
  fireEvent.click(
    group.querySelector(`button[value="${option.toLowerCase().replace('/', '')}"]`) as Element,
  )
}

describe('ChecklistForm', () => {
  it('raises the recorded message as a notification that outlives the replaced form', async () => {
    setup()
    choose('Panel secured', 'Pass')
    choose('Labels present', 'Pass')
    await recordAndConfirm('Record as passed')
    await waitFor(() => expect(success).toHaveBeenCalledWith('Recorded.'))
  })

  it('checklist form disables Record result until every required item is answered', () => {
    setup()
    const button = screen.getByRole('button', { name: 'Record result' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    choose('Panel secured', 'Pass')
    expect((button as HTMLButtonElement).disabled).toBe(true)
    choose('Labels present', 'Pass')
    expect((button as HTMLButtonElement).disabled).toBe(false)
  })

  it('the result reads passed only once every required item is answered', () => {
    setup()
    expect(screen.queryByText('Result: Passed')).toBeNull()
    expect(screen.getByText('Result: answer the required items first')).toBeTruthy()
    choose('Panel secured', 'Pass')
    expect(screen.queryByText('Result: Passed')).toBeNull()
    choose('Labels present', 'Pass')
    expect(screen.getByText('Result: Passed')).toBeTruthy()
  })

  it('checklist controls are labeled radio groups', () => {
    setup()
    for (const name of ['Panel secured', 'Labels present', 'Photos taken']) {
      const group = screen.getByRole('radiogroup', { name })
      expect(group.querySelectorAll('[role="radio"]')).toHaveLength(3)
    }
  })

  it('submits the answers with the row version and a passed result', async () => {
    const action = setup()
    choose('Panel secured', 'Pass')
    choose('Labels present', 'Pass')
    choose('Photos taken', 'N/A')
    await recordAndConfirm('Record as passed')
    await waitFor(() => expect(action).toHaveBeenCalled())
    const sent = (action.mock.calls[0] as unknown as [FormData])[0]
    expect(sent.get('inspectionId')).toBe('i1')
    expect(sent.get('expectedRowVersion')).toBe('3')
    expect(sent.get('csrf_token')).toBe('t1')
    expect(sent.get('result')).toBe('passed')
    expect(sent.get('item:a')).toBe('pass')
    expect(sent.get('item:b')).toBe('pass')
    expect(sent.get('item:c')).toBe('na')
  })

  it('a required item marked N/A never reads as passed and keeps Record result disabled', () => {
    setup()
    choose('Panel secured', 'Pass')
    choose('Labels present', 'N/A')
    expect(screen.queryByText('Result: Passed')).toBeNull()
    expect(screen.getByText('A required item is N/A. Mark it Pass or Fail.')).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Record result' }).disabled).toBe(
      true,
    )
  })

  it('a required item marked N/A beside a failed item still records a failure', () => {
    setup()
    choose('Panel secured', 'Fail')
    choose('Labels present', 'N/A')
    expect(screen.getByText('Result: Failed')).toBeTruthy()
    expect(screen.queryByText('A required item is N/A. Mark it Pass or Fail.')).toBeNull()
  })

  it('asks before recording, naming the result, and sends nothing when kept editing', async () => {
    const action = setup()
    choose('Panel secured', 'Pass')
    choose('Labels present', 'Pass')
    fireEvent.click(screen.getByRole('button', { name: 'Record result' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Record the Final inspection as passed?',
    })
    expect(dialog.textContent).toContain('A result cannot be changed once it is recorded.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(action).not.toHaveBeenCalled()
  })

  it('returns focus to Record result when the dialog is dismissed', async () => {
    setup()
    choose('Panel secured', 'Pass')
    choose('Labels present', 'Pass')
    const button = screen.getByRole('button', { name: 'Record result' })
    button.focus()
    fireEvent.click(button)
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(button))
  })

  it('on a final, says above the button and in the dialog that passing closes the permit', async () => {
    setup(undefined, CLOSING)
    expect(screen.getByText('Passing this final closes permit EL-2026-0001.')).toBeTruthy()
    choose('Panel secured', 'Pass')
    choose('Labels present', 'Pass')
    fireEvent.click(screen.getByRole('button', { name: 'Record result' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Record the Final inspection as passed?',
    })
    expect(dialog.textContent).toContain('This closes permit EL-2026-0001.')
  })

  it('a failure on a final does not claim to close the permit', async () => {
    setup(undefined, CLOSING)
    choose('Panel secured', 'Fail')
    choose('Labels present', 'Pass')
    fireEvent.change(screen.getByLabelText('Notes for the permit holder'), {
      target: { value: 'Secure the panel box and call again' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Record result' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Record the Final inspection as failed?',
    })
    expect(dialog.textContent).not.toContain('closes permit')
  })

  it('labels the note on a failed item with visible text', () => {
    setup()
    choose('Panel secured', 'Fail')
    const note = screen.getByLabelText('Note on Panel secured')
    const label = document.querySelector(`label[for="${note.id}"]`)
    expect(label?.textContent).toBe('Note on Panel secured')
  })

  it('a failed item switches the result to failed and asks for notes', () => {
    setup()
    choose('Panel secured', 'Fail')
    choose('Labels present', 'Pass')
    expect(screen.getByText('Result: Failed')).toBeTruthy()
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Record result' })
    expect(button.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Notes for the permit holder'), {
      target: { value: 'Secure the panel box and call again' },
    })
    expect(button.disabled).toBe(false)
  })

  it('a stale inspection says it changed and reloads', async () => {
    const action = vi.fn(() =>
      Promise.resolve<ActionResult>({
        ok: false,
        error: 'This inspection changed since you opened it',
      }),
    )
    setup(action)
    choose('Panel secured', 'Pass')
    choose('Labels present', 'Pass')
    await recordAndConfirm('Record as passed')
    await waitFor(() =>
      expect(screen.getByText('This inspection changed since you opened it')).toBeTruthy(),
    )
  })
})

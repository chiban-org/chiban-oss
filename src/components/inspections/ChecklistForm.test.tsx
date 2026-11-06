// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

function setup(
  action: Mock<(formData: FormData) => Promise<ActionResult>> = vi.fn(() =>
    Promise.resolve<ActionResult>({ ok: true, message: 'Recorded.' }),
  ),
) {
  render(
    <CsrfProvider token="t1">
      <ChecklistForm
        inspectionId="i1"
        rowVersion={3}
        items={items}
        action={action}
        initialNotes=""
      />
    </CsrfProvider>,
  )
  return action
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
    fireEvent.click(screen.getByRole('button', { name: 'Record result' }))
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
    choose('Labels present', 'N/A')
    fireEvent.click(screen.getByRole('button', { name: 'Record result' }))
    await waitFor(() => expect(action).toHaveBeenCalled())
    const sent = (action.mock.calls[0] as unknown as [FormData])[0]
    expect(sent.get('inspectionId')).toBe('i1')
    expect(sent.get('expectedRowVersion')).toBe('3')
    expect(sent.get('csrf_token')).toBe('t1')
    expect(sent.get('item:a')).toBe('pass')
    expect(sent.get('item:b')).toBe('na')
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
    fireEvent.click(screen.getByRole('button', { name: 'Record result' }))
    await waitFor(() =>
      expect(screen.getByText('This inspection changed since you opened it')).toBeTruthy(),
    )
  })
})

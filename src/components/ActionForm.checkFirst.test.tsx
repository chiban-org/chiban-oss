// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionForm } from '@/components/ActionForm'
import { CsrfProvider } from '@/components/CsrfProvider'
import { TextField } from '@/components/staff/fields'
import { CHECK_ONLY_FIELD, CHECK_UNSUPPORTED_COPY } from '@/constants/formCheck'
import type { ActionResult } from '@/server/actionRunner'

afterEach(cleanup)

const REFUND = {
  title: 'Refund this payment?',
  body: 'A refund cannot be undone.',
  confirmLabel: 'Refund',
}

const SHORT_REASON: ActionResult = {
  ok: false,
  error: 'Enter a reason of at least 10 characters.',
  fieldErrors: { reason: 'Enter a reason of at least 10 characters.' },
}

type Action = (formData: FormData) => Promise<ActionResult>

function renderRefund(check: ActionResult) {
  const action = vi.fn<Action>((formData) =>
    Promise.resolve(formData.has(CHECK_ONLY_FIELD) ? check : { ok: true, message: 'Refunded.' }),
  )
  render(
    <CsrfProvider token="t1">
      <ActionForm action={action} submitLabel="Refund payment" confirm={REFUND}>
        <TextField label="Reason" name="reason" required />
      </ActionForm>
    </CsrfProvider>,
  )
  return action
}

function sent(action: ReturnType<typeof renderRefund>): FormData[] {
  return action.mock.calls.map(([formData]) => formData).filter((f) => !f.has(CHECK_ONLY_FIELD))
}

function submitReason(value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: /Reason/ }), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Refund payment' }))
}

describe('ActionForm with a confirm step and an action that checks input', () => {
  it('shows the refusal beside the field and never opens the dialog when the check fails', async () => {
    const action = renderRefund(SHORT_REASON)
    submitReason('short')
    await screen.findByText('Enter a reason of at least 10 characters.', {
      selector: '[data-slot="field"] p',
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(action.mock.calls.map(([f]) => [f.get(CHECK_ONLY_FIELD), f.get('reason')])).toEqual([
      ['1', 'short'],
    ])
    expect(sent(action)).toEqual([])
  })

  it('opens the dialog after a passing check and sends the form once, unmarked, on confirm', async () => {
    const action = renderRefund({ ok: true, message: '' })
    submitReason('Paid twice by mistake')
    fireEvent.click(await screen.findByRole('button', { name: 'Refund' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Refunded.'))
    expect(sent(action).map((f) => f.get('reason'))).toEqual(['Paid twice by mistake'])
  })

  it('opens the dialog as before when the action does not answer checks', async () => {
    const action = renderRefund({ ok: false, error: CHECK_UNSUPPORTED_COPY })
    submitReason('Paid twice by mistake')
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('status', { hidden: true }).textContent).toBe('')
    expect(sent(action)).toEqual([])
  })

  it('shows a refused session from the check instead of opening the dialog', async () => {
    renderRefund({ ok: false, error: 'Your session expired. Reload the page and try again.' })
    submitReason('Paid twice by mistake')
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'Your session expired. Reload the page and try again.',
      ),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

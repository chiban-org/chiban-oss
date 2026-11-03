// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ActionForm } from '@/components/ActionForm'
import { CsrfProvider } from '@/components/CsrfProvider'

afterEach(cleanup)

function renderForm() {
  render(
    <CsrfProvider token="t1">
      <ActionForm
        action={() => Promise.resolve({ ok: true as const, message: 'Saved.' })}
        submitLabel="Override with reason"
      >
        <label>
          Note
          <input name="note" />
        </label>
        <label>
          Reason
          <input name="reason" required />
        </label>
        <label>
          Filed on
          <input name="filedOn" type="date" required />
        </label>
      </ActionForm>
    </CsrfProvider>,
  )
}

describe('ActionForm errors', () => {
  it('marks each empty required field invalid, ties it to the message, and focuses the first', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Override with reason' }))
    const reason = screen.getByLabelText('Reason')
    const filed = screen.getByLabelText('Filed on')
    const message = await waitFor(() => screen.getByText('Fill in: Reason, Filed on.'))
    expect(reason.getAttribute('aria-invalid')).toBe('true')
    expect(filed.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText('Note').getAttribute('aria-invalid')).toBeNull()
    expect(message.id).not.toBe('')
    expect(reason.getAttribute('aria-describedby')).toBe(message.id)
    expect(document.activeElement).toBe(reason)
    expect(message.getAttribute('data-tone')).toBe('failed')
  })

  it('clears the invalid marks once the person edits the form', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Override with reason' }))
    const reason = screen.getByLabelText('Reason')
    await waitFor(() => expect(reason.getAttribute('aria-invalid')).toBe('true'))
    fireEvent.input(reason, { target: { value: 'A good reason' } })
    expect(reason.getAttribute('aria-invalid')).toBeNull()
    expect(reason.getAttribute('aria-describedby')).toBeNull()
  })

  it('a failed action reads in the failed tone and a success does not', async () => {
    render(
      <CsrfProvider token="t1">
        <ActionForm
          action={() => Promise.resolve({ ok: false as const, error: 'Refused.' })}
          submitLabel="Save"
        >
          <input name="x" />
        </ActionForm>
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const message = await waitFor(() => screen.getByText('Refused.'))
    expect(message.getAttribute('data-tone')).toBe('failed')
  })
})

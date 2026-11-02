// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ActionForm } from '@/components/ActionForm'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { ActionResult } from '@/server/actionRunner'

afterEach(cleanup)

describe('ActionForm', () => {
  it('shows the failure message from the action and re-enables the button', async () => {
    render(
      <CsrfProvider token="t1">
        <ActionForm
          action={() => Promise.resolve({ ok: false as const, error: 'A reason is required.' })}
          submitLabel="Save"
        >
          <input name="reason" />
        </ActionForm>
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText('A reason is required.')).toBeTruthy())
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).toBe(false)
  })

  it('carries the csrf token in a hidden field', () => {
    const { container } = render(
      <CsrfProvider token="t1">
        <ActionForm
          action={() => Promise.resolve({ ok: true as const, message: 'ok' })}
          submitLabel="Save"
        >
          <span />
        </ActionForm>
      </CsrfProvider>,
    )
    expect((container.querySelector('input[name="csrf_token"]') as HTMLInputElement).value).toBe(
      't1',
    )
  })
  it('says which required field is empty instead of ignoring the click', async () => {
    let called = false
    render(
      <CsrfProvider token="t1">
        <ActionForm
          action={() => {
            called = true
            return Promise.resolve({ ok: true as const, message: 'ok' })
          }}
          submitLabel="Record returned check"
        >
          <label>
            Returned on
            <input name="returnedOn" type="date" required />
          </label>
        </ActionForm>
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Record returned check' }))
    await waitFor(() => expect(screen.getByText('Fill in: Returned on.')).toBeTruthy())
    expect(called).toBe(false)
    fireEvent.change(screen.getByLabelText('Returned on'), { target: { value: '2027-06-03' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record returned check' }))
    await waitFor(() => expect(called).toBe(true))
    expect(screen.queryByText('Fill in: Returned on.')).toBeNull()
  })

  describe('values after a server answer', () => {
    function renderForm(result: ActionResult) {
      return render(
        <CsrfProvider token="t1">
          <ActionForm action={() => Promise.resolve(result)} submitLabel="Save">
            <input name="reason" aria-label="Reason" />
            <textarea name="notes" aria-label="Notes" />
            <select name="kind" aria-label="Kind" defaultValue="a">
              <option value="a">A</option>
              <option value="b">B</option>
            </select>
            <input type="checkbox" name="agree" aria-label="Agree" />
          </ActionForm>
        </CsrfProvider>,
      )
    }

    function fillIn() {
      fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'typed reason' } })
      fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'line one\nline two' } })
      fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'b' } })
      fireEvent.click(screen.getByLabelText('Agree'))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    }

    it('keeps what the user typed when the action fails', async () => {
      renderForm({ ok: false, error: 'Check the form fields and try again.' })
      fillIn()
      await waitFor(() =>
        expect(screen.getByText('Check the form fields and try again.')).toBeTruthy(),
      )
      expect(screen.getByLabelText<HTMLInputElement>('Reason').value).toBe('typed reason')
      expect(screen.getByLabelText<HTMLTextAreaElement>('Notes').value).toBe('line one\nline two')
      expect(screen.getByLabelText<HTMLSelectElement>('Kind').value).toBe('b')
      expect(screen.getByLabelText<HTMLInputElement>('Agree').checked).toBe(true)
    })

    it('clears the form when the action succeeds', async () => {
      renderForm({ ok: true, message: 'Saved.' })
      fillIn()
      await waitFor(() => expect(screen.getByText('Saved.')).toBeTruthy())
      expect(screen.getByLabelText<HTMLInputElement>('Reason').value).toBe('')
      expect(screen.getByLabelText<HTMLSelectElement>('Kind').value).toBe('a')
    })
  })
  it('clears an old message once the person edits the form again', async () => {
    render(
      <CsrfProvider token="t1">
        <ActionForm
          action={() => Promise.resolve({ ok: false as const, error: 'A reason is required.' })}
          submitLabel="Save"
        >
          <label>
            Reason
            <input name="reason" required />
          </label>
        </ActionForm>
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText('Fill in: Reason.')).toBeTruthy())
    fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Because' } })
    expect(screen.getByRole('status').textContent).toBe('')
  })
})

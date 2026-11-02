// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ActionForm } from '@/components/ActionForm'
import { CsrfProvider } from '@/components/CsrfProvider'
import { restoreSubmittedValues } from '@/components/useFormAction'

afterEach(cleanup)

describe('ActionForm when the request itself fails', () => {
  it('shows a message and keeps the typed text when the action throws', async () => {
    render(
      <CsrfProvider token="t1">
        <ActionForm
          action={() => Promise.reject(new Error('Body exceeded 1 MB limit'))}
          submitLabel="Send"
        >
          <input name="reason" aria-label="Reason" />
        </ActionForm>
      </CsrfProvider>,
    )
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'typed reason' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'The form could not be sent. Check your connection and any attached files, then try again.',
      ),
    )
    expect(screen.getByLabelText<HTMLInputElement>('Reason').value).toBe('typed reason')
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send' }).disabled).toBe(false)
  })

  it('stops the submit and shows the message a pre-submit check returns', async () => {
    let called = false
    render(
      <CsrfProvider token="t1">
        <ActionForm
          action={() => {
            called = true
            return Promise.resolve({ ok: true as const, message: 'ok' })
          }}
          checkBeforeSubmit={() => 'The photos are too large.'}
          submitLabel="Send"
        >
          <input name="reason" aria-label="Reason" />
        </ActionForm>
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.getByText('The photos are too large.')).toBeTruthy())
    expect(called).toBe(false)
  })

  it('names a filled field whose value is invalid as one to check, not one to fill in', async () => {
    render(
      <CsrfProvider token="t1">
        <ActionForm
          action={() => Promise.resolve({ ok: true as const, message: 'ok' })}
          submitLabel="Send"
        >
          <label>
            Your email (optional)
            <input name="email" type="email" />
          </label>
        </ActionForm>
      </CsrfProvider>,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Check: Your email (optional).'),
    )
  })
})

describe('restoreSubmittedValues', () => {
  it('puts submitted files back on a file input', () => {
    const form = document.createElement('form')
    const input = document.createElement('input')
    input.type = 'file'
    input.name = 'photos'
    form.append(input)
    const photo = new File(['x'], 'photo.png', { type: 'image/png' })
    const assigned: File[][] = []
    Object.defineProperty(input, 'files', {
      configurable: true,
      get: () => null,
      set: (list: { items: File[] }) => assigned.push(list.items),
    })
    const original = (globalThis as { DataTransfer?: unknown }).DataTransfer
    ;(globalThis as { DataTransfer?: unknown }).DataTransfer = class {
      private readonly list: File[] = []
      readonly items = { add: (f: File) => this.list.push(f) }
      get files() {
        return { items: this.list }
      }
    }
    try {
      restoreSubmittedValues(form, [['photos', photo]])
    } finally {
      ;(globalThis as { DataTransfer?: unknown }).DataTransfer = original
    }
    expect(assigned).toEqual([[photo]])
  })
})

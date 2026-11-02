// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ActionForm } from '@/components/ActionForm'
import { CsrfProvider } from '@/components/CsrfProvider'

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
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false)
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
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionForm } from '@/components/ActionForm'
import { CsrfProvider } from '@/components/CsrfProvider'
import { FormDialog } from '@/components/FormDialog'

afterEach(cleanup)

function renderDialog(ok: boolean, closeOnSuccess: boolean) {
  const action = vi.fn((_: FormData) =>
    Promise.resolve(
      ok
        ? { ok: true as const, message: 'Officer designated.' }
        : { ok: false as const, error: 'No.' },
    ),
  )
  render(
    <CsrfProvider token="t1">
      <FormDialog label="Designate an officer" title="Designate an officer">
        <ActionForm action={action} submitLabel="Designate officer" closeOnSuccess={closeOnSuccess}>
          <input type="hidden" name="userId" value="u1" />
        </ActionForm>
      </FormDialog>
    </CsrfProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Designate an officer' }))
  fireEvent.click(screen.getByRole('button', { name: 'Designate officer' }))
}

describe('FormDialog with an ActionForm that closes on success', () => {
  it('closes after the action succeeds', async () => {
    renderDialog(true, true)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('stays open when the action fails, so the error is read', async () => {
    renderDialog(false, true)
    await waitFor(() => expect(screen.getByText('No.')).toBeTruthy())
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('stays open after success when the form does not ask to close', async () => {
    renderDialog(true, false)
    await waitFor(() => expect(screen.getByText('Officer designated.')).toBeTruthy())
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})

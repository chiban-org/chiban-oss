// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionForm } from '@/components/ActionForm'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { ActionResult } from '@/server/actionRunner'

const success = vi.fn()
vi.mock('sonner', () => ({ toast: { success: (message: string) => success(message) } }))

afterEach(() => {
  cleanup()
  success.mockClear()
})

function renderWith(action: () => Promise<ActionResult>) {
  render(
    <CsrfProvider token="t1">
      <ActionForm action={action} submitLabel="Save">
        <span />
      </ActionForm>
    </CsrfProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
}

describe('ActionForm confirmation', () => {
  it('raises the success message as a notification that outlives the form', async () => {
    renderWith(() => Promise.resolve({ ok: true, message: 'Reviewer assigned.' }))
    await waitFor(() => expect(success).toHaveBeenCalledWith('Reviewer assigned.'))
    expect(success).toHaveBeenCalledTimes(1)
  })

  it('raises no notification when the action is refused', async () => {
    renderWith(() => Promise.resolve({ ok: false, error: 'Nope.' }))
    await waitFor(() => expect(screen.getByText('Nope.')).toBeTruthy())
    expect(success).not.toHaveBeenCalled()
  })
})

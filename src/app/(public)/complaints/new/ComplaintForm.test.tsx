// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'

vi.mock('./actions', () => ({
  submitComplaintAction: vi.fn(() =>
    Promise.resolve({
      ok: false as const,
      error: 'Enter where the property is. Enter what you saw.',
      fieldErrors: {
        locationText: 'Enter where the property is.',
        description: 'Enter what you saw.',
      },
    }),
  ),
}))

const { ComplaintForm } = await import('./ComplaintForm')

afterEach(cleanup)

describe('ComplaintForm', () => {
  it('shows each refusal beside its own field', async () => {
    render(
      <CsrfProvider token="t1">
        <ComplaintForm />
      </CsrfProvider>,
    )
    const location = screen.getByRole('textbox', { name: /Where is the property/ })
    const description = screen.getByRole('textbox', { name: /What did you see/ })
    fireEvent.change(location, { target: { value: '   ' } })
    fireEvent.change(description, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
    await waitFor(() => expect(location.getAttribute('aria-invalid')).toBe('true'))
    expect(location.closest('[data-slot="field"]')?.textContent).toContain(
      'Enter where the property is.',
    )
    expect(description.closest('[data-slot="field"]')?.textContent).toContain('Enter what you saw.')
  })
})

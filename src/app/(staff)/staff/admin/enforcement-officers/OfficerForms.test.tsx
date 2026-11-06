// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'

vi.mock('./actions', () => ({
  designateOfficerAction: vi.fn(() =>
    Promise.resolve({
      ok: false,
      error: 'Enter who designated them of 200 characters or fewer.',
      fieldErrors: { adoptingAuthority: 'Enter who designated them of 200 characters or fewer.' },
    }),
  ),
  updateDesignationAction: vi.fn(),
}))

const { DesignateOfficer } = await import('./OfficerForms')

afterEach(cleanup)

describe('designate an officer', () => {
  it('shows the authority refusal beside the Designated by field', async () => {
    render(
      <CsrfProvider token="t1">
        <DesignateOfficer
          staff={[{ id: '5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f', name: 'Ira Vale' }]}
          today="2026-11-06"
        />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Designate an officer' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Designate officer' }))
    const authority = await screen.findByRole('textbox', { name: /^Designated by/ })
    await waitFor(() => expect(authority.getAttribute('aria-invalid')).toBe('true'))
    expect(authority.closest('[data-slot="field"]')?.textContent).toContain(
      'Enter who designated them of 200 characters or fewer.',
    )
  })
})

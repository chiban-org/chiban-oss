// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionForm } from '@/components/ActionForm'
import { CsrfProvider } from '@/components/CsrfProvider'
import { RoleChecks } from './RoleChecks'

afterEach(cleanup)

describe('RoleChecks inside a form that fails', () => {
  it('keeps the ticked roles after the error comes back', async () => {
    const action = vi.fn((_: FormData) =>
      Promise.resolve({ ok: false as const, error: 'That email address already has an account.' }),
    )
    render(
      <CsrfProvider token="t1">
        <ActionForm action={action} submitLabel="Send invite" variant="default">
          <RoleChecks selected={[]} />
        </ActionForm>
      </CsrfProvider>,
    )
    const reviewer = screen.getByRole('checkbox', { name: /Reviewer/ })
    fireEvent.click(reviewer)
    expect(reviewer.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }))
    await waitFor(() => expect(screen.getByText(/already has an account/)).toBeTruthy())
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /Reviewer/ }).getAttribute('aria-checked')).toBe(
        'true',
      ),
    )
    expect(screen.getByText(/already has an account/)).toBeTruthy()
  })
})

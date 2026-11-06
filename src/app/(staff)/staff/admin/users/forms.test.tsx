// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { CHECK_ONLY_FIELD } from '@/constants/formCheck'
import type { UserDetail } from '@/features/users/userDetail'

const actions = vi.hoisted(() => ({
  inviteStaffAction: vi.fn(),
  disableAction: vi.fn(),
  resetAuthenticatorAction: vi.fn(),
  revokeInviteAction: vi.fn(),
  sendResetAction: vi.fn(),
}))
vi.mock('./actions', () => actions)

const { InviteForm } = await import('./invite/InviteForm')
const { AccessPanel } = await import('./[userId]/AccessPanel')

afterEach(cleanup)

const DETAIL = {
  id: '5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f',
  displayName: 'Avery Stone',
  status: 'active',
  isSelf: false,
  soleAdmin: false,
  totpEnabled: false,
  hasTotpSecret: false,
} as unknown as UserDetail

describe('invite form', () => {
  it('shows a name refusal beside the Name field', async () => {
    actions.inviteStaffAction.mockResolvedValue({
      ok: false,
      error: 'Enter a name of 120 characters or fewer.',
      fieldErrors: { displayName: 'Enter a name of 120 characters or fewer.' },
    })
    render(
      <CsrfProvider token="t1">
        <InviteForm />
      </CsrfProvider>,
    )
    fireEvent.change(screen.getByRole('textbox', { name: /^Name/ }), { target: { value: 'x' } })
    fireEvent.change(screen.getByRole('textbox', { name: /^Email address/ }), {
      target: { value: 'x@alderpond.example' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }))
    const name = await screen.findByRole('textbox', { name: /^Name/ })
    await waitFor(() => expect(name.getAttribute('aria-invalid')).toBe('true'))
    expect(name.closest('[data-slot="field"]')?.textContent).toContain(
      'Enter a name of 120 characters or fewer.',
    )
  })
})

describe('disable account', () => {
  it('shows the reason refusal beside the Reason field and never opens the confirm', async () => {
    actions.disableAction.mockImplementation(async (form: FormData) =>
      form.has(CHECK_ONLY_FIELD)
        ? {
            ok: false,
            error: 'Enter the reason for disabling this account.',
            fieldErrors: { reason: 'Enter the reason for disabling this account.' },
          }
        : { ok: true, message: 'Account disabled.' },
    )
    render(
      <CsrfProvider token="t1">
        <AccessPanel detail={DETAIL} />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByText('Disable this account'))
    fireEvent.change(screen.getByRole('textbox', { name: /^Reason/ }), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Disable account' }))
    const reason = await screen.findByRole('textbox', { name: /^Reason/ })
    await waitFor(() => expect(reason.getAttribute('aria-invalid')).toBe('true'))
    expect(reason.closest('[data-slot="field"]')?.textContent).toContain(
      'Enter the reason for disabling this account.',
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      actions.disableAction.mock.calls.every(([f]) => (f as FormData).has(CHECK_ONLY_FIELD)),
    ).toBe(true)
  })
})

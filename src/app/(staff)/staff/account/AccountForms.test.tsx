// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'

const actions = vi.hoisted(() => ({ changeNameAction: vi.fn(), changePasswordAction: vi.fn() }))
vi.mock('./actions', () => actions)

const { ChangeNameForm, ChangePasswordForm } = await import('./AccountForms')

afterEach(cleanup)

function field(name: RegExp): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>(name)
}

describe('change name', () => {
  it('shows the refusal beside the Name field', async () => {
    actions.changeNameAction.mockResolvedValue({
      ok: false,
      error: 'Enter your name.',
      fieldErrors: { displayName: 'Enter your name.' },
    })
    render(
      <CsrfProvider token="t1">
        <ChangeNameForm displayName="Rae" />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    const name = await screen.findByRole('textbox', { name: /^Name/ })
    await waitFor(() => expect(name.getAttribute('aria-invalid')).toBe('true'))
    expect(name.closest('[data-slot="field"]')?.textContent).toContain('Enter your name.')
  })
})

describe('change password', () => {
  it('keeps the new password fields after a refusal and never refills the current one', async () => {
    actions.changePasswordAction.mockResolvedValue({
      ok: false,
      error: 'The current password is not right.',
      fieldErrors: { current: 'The current password is not right.' },
    })
    render(
      <CsrfProvider token="t1">
        <ChangePasswordForm minLength={12} />
      </CsrfProvider>,
    )
    fireEvent.change(field(/^Current password/), { target: { value: 'wrong wrong wrong' } })
    fireEvent.change(field(/^New password/), { target: { value: 'brand new password 1' } })
    fireEvent.change(field(/^Type the new password again/), {
      target: { value: 'brand new password 1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    const current = await screen.findByLabelText<HTMLInputElement>(/^Current password/)
    await waitFor(() => expect(current.getAttribute('aria-invalid')).toBe('true'))
    expect(current.closest('[data-slot="field"]')?.textContent).toContain(
      'The current password is not right.',
    )
    expect(current.value).toBe('')
    expect(field(/^New password/).value).toBe('brand new password 1')
    expect(field(/^Type the new password again/).value).toBe('brand new password 1')
  })
})

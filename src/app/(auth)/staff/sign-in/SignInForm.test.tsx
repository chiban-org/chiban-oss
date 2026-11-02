// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { SignInForm } from './SignInForm'

vi.mock('./actions', () => ({
  signInAction: () =>
    Promise.resolve({ error: 'Email, password, or code is incorrect.', needTotp: false }),
}))

afterEach(cleanup)

describe('SignInForm', () => {
  it('keeps the email after a wrong password and clears the password', async () => {
    render(
      <CsrfProvider token="t1">
        <SignInForm />
      </CsrfProvider>,
    )
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'clerk@example.test' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByLabelText<HTMLInputElement>('Email').value).toBe('clerk@example.test')
    expect(screen.getByLabelText<HTMLInputElement>('Password').value).toBe('')
  })
})

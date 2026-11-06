// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { SignInForm } from './SignInForm'

interface Reply {
  error: string | null
  needTotp: boolean
}

const WRONG: Reply = { error: 'Email, password, or code is incorrect.', needTotp: false }

const reply = vi.hoisted(() => ({ current: null as Reply | null }))

vi.mock('./actions', () => ({
  signInAction: () => Promise.resolve(reply.current ?? WRONG),
}))

afterEach(() => {
  cleanup()
  reply.current = null
})

describe('SignInForm', () => {
  it('keeps the email after a wrong password and clears the password', async () => {
    render(
      <CsrfProvider token="t1">
        <SignInForm />
      </CsrfProvider>,
    )
    fireEvent.change(screen.getByLabelText(/^Email( \*)?$/), {
      target: { value: 'clerk@example.test' },
    })
    fireEvent.change(screen.getByLabelText(/^Password( \*)?$/), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByLabelText<HTMLInputElement>(/^Email( \*)?$/).value).toBe(
      'clerk@example.test',
    )
    expect(screen.getByLabelText<HTMLInputElement>(/^Password( \*)?$/).value).toBe('')
  })

  it('keeps the email and the password when the form asks for the authenticator code', async () => {
    reply.current = { error: null, needTotp: true }
    render(
      <CsrfProvider token="t1">
        <SignInForm />
      </CsrfProvider>,
    )
    fireEvent.change(screen.getByLabelText(/^Email( \*)?$/), {
      target: { value: 'clerk@example.test' },
    })
    fireEvent.change(screen.getByLabelText(/^Password( \*)?$/), { target: { value: 'right' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() =>
      expect(screen.getByLabelText(/^6-digit code from your authenticator/)).toBeTruthy(),
    )
    expect(screen.getByLabelText<HTMLInputElement>(/^Email( \*)?$/).value).toBe(
      'clerk@example.test',
    )
    expect(screen.getByLabelText<HTMLInputElement>(/^Password( \*)?$/).value).toBe('right')
  })
})

'use client'

import { useActionState } from 'react'
import { CsrfField } from '@/components/CsrfField'
import { type SignInState, signInAction } from './actions'

const initial: SignInState = { error: null, needTotp: false }

export function SignInForm() {
  const [state, action, pending] = useActionState(signInAction, initial)

  return (
    <form action={action} className="flex flex-col gap-4">
      <CsrfField />
      <label className="flex flex-col gap-1">
        <span>Email</span>
        <input name="email" type="email" autoComplete="username" required className="border p-2" />
      </label>
      <label className="flex flex-col gap-1">
        <span>Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="border p-2"
        />
      </label>
      {state.needTotp ? (
        <label className="flex flex-col gap-1">
          <span>6-digit code from your authenticator</span>
          <input
            name="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            required
            className="border p-2"
          />
        </label>
      ) : null}
      {state.error === null ? null : <p role="alert">{state.error}</p>}
      <button type="submit" disabled={pending} className="p-2">
        {state.needTotp ? 'Verify and sign in' : 'Sign in'}
      </button>
    </form>
  )
}

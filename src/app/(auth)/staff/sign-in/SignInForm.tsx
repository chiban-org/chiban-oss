'use client'

import { CsrfField } from '@/components/CsrfField'
import { SubmitButton } from '@/components/SubmitButton'
import { useFormAction } from '@/components/useFormAction'
import { type SignInState, signInAction } from './actions'

const initial: SignInState = { error: null, needTotp: false }

function failed(state: SignInState): boolean {
  return state.error !== null
}

export function SignInForm() {
  const { state, formProps } = useFormAction(signInAction, initial, failed)

  return (
    <form {...formProps} className="flex flex-col gap-4">
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
      <SubmitButton className="p-2">
        {state.needTotp ? 'Verify and sign in' : 'Sign in'}
      </SubmitButton>
    </form>
  )
}

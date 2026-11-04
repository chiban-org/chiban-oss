'use client'

import { CsrfField } from '@/components/CsrfField'
import { SubmitButton } from '@/components/SubmitButton'
import { TextField } from '@/components/staff/fields'
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
      <TextField label="Email" name="email" type="email" autoComplete="username" required />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {state.needTotp ? (
        <TextField
          label="6-digit code from your authenticator"
          name="totp"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          required
        />
      ) : null}
      {state.error === null ? null : <p role="alert">{state.error}</p>}
      <SubmitButton>{state.needTotp ? 'Verify and sign in' : 'Sign in'}</SubmitButton>
    </form>
  )
}

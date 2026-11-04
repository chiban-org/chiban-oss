'use client'

import { CsrfField } from '@/components/CsrfField'
import { SubmitButton } from '@/components/SubmitButton'
import { TextField } from '@/components/staff/fields'
import { useFormAction } from '@/components/useFormAction'
import { type SetPasswordState, setPasswordAction } from './actions'

const initial: SetPasswordState = { error: null }

function failed(state: SetPasswordState): boolean {
  return state.error !== null
}

export function SetPasswordForm({
  token,
  email,
  minLength,
  submitLabel,
}: {
  token: string
  email: string
  minLength: number
  submitLabel: string
}) {
  const { state, formProps } = useFormAction(setPasswordAction, initial, failed)
  return (
    <form {...formProps} className="flex flex-col gap-4">
      <CsrfField />
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="username" autoComplete="username" value={email} readOnly />
      <TextField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={minLength}
        hint={`At least ${minLength} characters.`}
        required
      />
      <TextField
        label="Type it again"
        name="confirm"
        type="password"
        autoComplete="new-password"
        minLength={minLength}
        required
      />
      {state.error === null ? null : <p role="alert">{state.error}</p>}
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  )
}

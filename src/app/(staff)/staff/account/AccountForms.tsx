'use client'

import { CsrfField } from '@/components/CsrfField'
import { SubmitButton } from '@/components/SubmitButton'
import { TextField } from '@/components/staff/fields'
import { RequiredNote } from '@/components/ui/required-mark'
import { useFormAction } from '@/components/useFormAction'
import { type AccountChangeState, changeNameAction, changePasswordAction } from './actions'

const initial: AccountChangeState = { error: null, message: null }

function failed(state: AccountChangeState): boolean {
  return state.error !== null
}

function Outcome({ state }: { state: AccountChangeState }) {
  if (state.error !== null) return <p role="alert">{state.error}</p>
  return state.message === null ? null : <p role="status">{state.message}</p>
}

export function ChangeNameForm({ displayName }: { displayName: string }) {
  const { state, formProps } = useFormAction(changeNameAction, initial, failed)
  return (
    <form {...formProps} className="flex flex-col gap-3">
      <RequiredNote />
      <CsrfField />
      <TextField
        label="Name"
        name="displayName"
        defaultValue={displayName}
        autoComplete="name"
        maxLength={120}
        required
      />
      <Outcome state={state} />
      <SubmitButton variant="outline" className="self-start">
        Save name
      </SubmitButton>
    </form>
  )
}

export function ChangePasswordForm({ minLength }: { minLength: number }) {
  const { state, formProps } = useFormAction(changePasswordAction, initial, failed)
  return (
    <form {...formProps} className="flex flex-col gap-3">
      <RequiredNote />
      <CsrfField />
      <TextField
        label="Current password"
        name="current"
        type="password"
        autoComplete="current-password"
        required
      />
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
        label="Type the new password again"
        name="confirm"
        type="password"
        autoComplete="new-password"
        minLength={minLength}
        required
      />
      <Outcome state={state} />
      <SubmitButton variant="outline" className="self-start">
        Change password
      </SubmitButton>
    </form>
  )
}

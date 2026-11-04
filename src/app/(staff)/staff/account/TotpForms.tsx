'use client'

import { useActionState } from 'react'
import { CsrfField } from '@/components/CsrfField'
import { SubmitButton } from '@/components/SubmitButton'
import { buttonVariants } from '@/components/ui/button'
import { useFormAction } from '@/components/useFormAction'
import { beginTotpAction, confirmTotpAction, type TotpState } from './actions'

const initial: TotpState = { error: null }

function failed(state: TotpState): boolean {
  return state.error !== null
}

export function BeginTotpForm() {
  const [state, action] = useActionState(beginTotpAction, initial)
  return (
    <form action={action} className="flex flex-col gap-3">
      <CsrfField />
      {state.error === null ? null : <p role="alert">{state.error}</p>}
      <SubmitButton className={buttonVariants({ className: 'self-start' })}>
        Set up authenticator
      </SubmitButton>
    </form>
  )
}

export function ConfirmTotpForm() {
  const { state, formProps } = useFormAction(confirmTotpAction, initial, failed)
  return (
    <form {...formProps} className="flex flex-col gap-3">
      <CsrfField />
      <label className="flex flex-col gap-1">
        <span>6-digit code</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          required
          className="max-w-48 rounded-md border border-control-border bg-surface px-3 py-2"
        />
      </label>
      {state.error === null ? null : <p role="alert">{state.error}</p>}
      <SubmitButton className={buttonVariants({ className: 'self-start' })}>Confirm</SubmitButton>
    </form>
  )
}

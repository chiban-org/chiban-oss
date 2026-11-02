'use client'

import { useActionState } from 'react'
import { CsrfField } from '@/components/CsrfField'
import { useFormAction } from '@/components/useFormAction'
import { beginTotpAction, confirmTotpAction, type TotpState } from './actions'

const initial: TotpState = { error: null }

function failed(state: TotpState): boolean {
  return state.error !== null
}

export function BeginTotpForm() {
  const [state, action, pending] = useActionState(beginTotpAction, initial)
  return (
    <form action={action} className="flex flex-col gap-3">
      <CsrfField />
      {state.error === null ? null : <p role="alert">{state.error}</p>}
      <button type="submit" disabled={pending}>
        Set up authenticator
      </button>
    </form>
  )
}

export function ConfirmTotpForm() {
  const { state, pending, formProps } = useFormAction(confirmTotpAction, initial, failed)
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
          className="border p-2"
        />
      </label>
      {state.error === null ? null : <p role="alert">{state.error}</p>}
      <button type="submit" disabled={pending}>
        Confirm
      </button>
    </form>
  )
}

'use client'

import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import { beginTotpAction, confirmTotpAction } from './actions'

export function BeginTotpForm() {
  return (
    <ActionForm
      action={beginTotpAction}
      submitLabel="Set up authenticator"
      variant="default"
      compact
    >
      {null}
    </ActionForm>
  )
}

export function ConfirmTotpForm() {
  return (
    <ActionForm action={confirmTotpAction} submitLabel="Confirm" variant="default">
      <TextField
        label="6-digit code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        required
        className="max-w-48"
      />
    </ActionForm>
  )
}

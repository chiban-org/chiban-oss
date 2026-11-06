'use client'

import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import { changeNameAction, changePasswordAction } from './actions'
import { MAX_NAME_LENGTH } from './limits'

export function ChangeNameForm({ displayName }: { displayName: string }) {
  return (
    <ActionForm action={changeNameAction} submitLabel="Save name" className="gap-3">
      <TextField
        label="Name"
        name="displayName"
        defaultValue={displayName}
        autoComplete="name"
        maxLength={MAX_NAME_LENGTH}
        required
      />
    </ActionForm>
  )
}

export function ChangePasswordForm({ minLength }: { minLength: number }) {
  return (
    <ActionForm action={changePasswordAction} submitLabel="Change password" className="gap-3">
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
        data-restore-on-error="true"
        required
      />
      <TextField
        label="Type the new password again"
        name="confirm"
        type="password"
        autoComplete="new-password"
        minLength={minLength}
        data-restore-on-error="true"
        required
      />
    </ActionForm>
  )
}

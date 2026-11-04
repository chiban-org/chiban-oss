import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import { inviteStaffAction } from '../actions'
import { RoleChecks } from '../RoleChecks'

export function InviteForm() {
  return (
    <ActionForm
      action={inviteStaffAction}
      submitLabel="Send invite"
      variant="default"
      className="max-w-md"
    >
      <TextField label="Name" name="displayName" autoComplete="off" required />
      <TextField label="Email address" name="email" type="email" autoComplete="off" required />
      <RoleChecks selected={[]} />
    </ActionForm>
  )
}

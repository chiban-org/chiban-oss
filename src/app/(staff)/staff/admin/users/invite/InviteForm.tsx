import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import { inviteStaffAction } from '../actions'
import { MAX_DISPLAY_NAME_LENGTH } from '../forms'
import { RoleChecks } from '../RoleChecks'

export function InviteForm() {
  return (
    <ActionForm
      action={inviteStaffAction}
      submitLabel="Send invite"
      variant="default"
      className="max-w-md"
    >
      <TextField
        label="Name"
        name="displayName"
        autoComplete="off"
        maxLength={MAX_DISPLAY_NAME_LENGTH}
        required
      />
      <TextField label="Email address" name="email" type="email" autoComplete="off" required />
      <RoleChecks selected={[]} />
    </ActionForm>
  )
}

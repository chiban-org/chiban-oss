import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import { inviteMemberAction } from './actions'

export function AddMember({ today }: { today: string }) {
  return (
    <details>
      <summary>Add a board member</summary>
      <ActionForm action={inviteMemberAction} submitLabel="Add member" className="max-w-md">
        <TextField label="Name" name="displayName" required />
        <TextField label="Email address" name="email" type="email" required />
        <SelectField
          label="Board"
          name="board"
          options={[
            ['planning_board', 'Planning Board'],
            ['zba', 'Zoning Board of Adjustment'],
          ]}
        />
        <SelectField
          label="Role on the board"
          name="title"
          options={[
            ['member', 'Member'],
            ['chair', 'Chair'],
            ['vice_chair', 'Vice chair'],
            ['alternate', 'Alternate'],
            ['clerk', 'Clerk'],
          ]}
        />
        <TextField label="Term starts" name="termStart" type="date" defaultValue={today} required />
        <TextField
          label="Term ends"
          name="termEnd"
          type="date"
          hint="Leave blank if there is no end date."
        />
      </ActionForm>
    </details>
  )
}

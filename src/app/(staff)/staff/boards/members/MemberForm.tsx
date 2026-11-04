import { ActionForm } from '@/components/ActionForm'
import { FormDialog, RowEditDialog } from '@/components/FormDialog'
import { SelectField, TextField } from '@/components/staff/fields'
import type { MemberRow } from '@/features/boards/membersView'
import { inviteMemberAction, updateMemberAction } from './actions'

const BOARDS = [
  ['planning_board', 'Planning Board'],
  ['zba', 'Zoning Board of Adjustment'],
] as const

const ROLES = [
  ['member', 'Member'],
  ['chair', 'Chair'],
  ['vice_chair', 'Vice chair'],
  ['alternate', 'Alternate'],
  ['clerk', 'Clerk'],
] as const

function MemberFields({ current, today }: { current?: MemberRow; today: string }) {
  return (
    <>
      <TextField label="Name" name="displayName" defaultValue={current?.name} required />
      <TextField
        label="Email address"
        name="email"
        type="email"
        defaultValue={current?.email}
        required
      />
      <SelectField label="Board" name="board" options={BOARDS} defaultValue={current?.board} />
      <SelectField
        label="Role on the board"
        name="title"
        options={ROLES}
        defaultValue={current?.title}
      />
      <TextField
        label="Term starts"
        name="termStart"
        type="date"
        defaultValue={current?.termStart ?? today}
        required
      />
      <TextField
        label="Term ends"
        name="termEnd"
        type="date"
        defaultValue={current?.termEnd ?? undefined}
        hint="Leave blank if there is no end date."
      />
    </>
  )
}

export function AddMember({ today }: { today: string }) {
  return (
    <FormDialog
      label="Add member"
      title="Add a board member"
      description="They are emailed how to sign in."
      variant="default"
    >
      <ActionForm action={inviteMemberAction} submitLabel="Add member" className="max-w-md">
        <MemberFields today={today} />
      </ActionForm>
    </FormDialog>
  )
}

export function EditMember({ row, today }: { row: MemberRow; today: string }) {
  return (
    <RowEditDialog
      record={row.name}
      title={`Edit ${row.name}`}
      description="A new name or email applies to every board this person sits on."
    >
      <ActionForm action={updateMemberAction} submitLabel="Save changes" className="max-w-md">
        <input type="hidden" name="membershipId" value={row.membershipId} />
        <MemberFields current={row} today={today} />
      </ActionForm>
    </RowEditDialog>
  )
}

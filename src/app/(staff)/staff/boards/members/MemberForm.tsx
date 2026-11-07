import { ActionForm } from '@/components/ActionForm'
import { FormDialog, RowEditDialog } from '@/components/FormDialog'
import { SelectField, TextField } from '@/components/staff/fields'
import type { BoardOption, MemberRow } from '@/features/boards/membersView'
import { inviteMemberAction, updateMemberAction } from './actions'

const ROLES = [
  ['member', 'Member'],
  ['chair', 'Chair'],
  ['vice_chair', 'Vice chair'],
  ['alternate', 'Alternate'],
  ['clerk', 'Clerk'],
] as const

interface MemberFieldsProps {
  current?: MemberRow
  today: string
  boards: readonly BoardOption[]
}

function MemberFields({ current, today, boards }: MemberFieldsProps) {
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
      <SelectField label="Board" name="boardId" options={boards} defaultValue={current?.boardId} />
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

export function AddMember({ today, boards }: { today: string; boards: readonly BoardOption[] }) {
  return (
    <FormDialog
      label="Add member"
      title="Add a board member"
      description="They are emailed how to sign in."
      variant="default"
    >
      <ActionForm action={inviteMemberAction} submitLabel="Add member" className="max-w-md">
        <MemberFields today={today} boards={boards} />
      </ActionForm>
    </FormDialog>
  )
}

export function EditMember({
  row,
  today,
  boards,
}: {
  row: MemberRow
  today: string
  boards: readonly BoardOption[]
}) {
  return (
    <RowEditDialog
      record={row.name}
      title={`Edit ${row.name}`}
      description="A new name or email applies to every board this person sits on."
    >
      <ActionForm action={updateMemberAction} submitLabel="Save changes" className="max-w-md">
        <input type="hidden" name="membershipId" value={row.membershipId} />
        <MemberFields current={row} today={today} boards={boards} />
      </ActionForm>
    </RowEditDialog>
  )
}

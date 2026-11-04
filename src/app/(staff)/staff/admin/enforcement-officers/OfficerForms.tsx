import { ActionForm } from '@/components/ActionForm'
import { FormDialog, RowEditDialog } from '@/components/FormDialog'
import { SelectField, TextField } from '@/components/staff/fields'
import { designateOfficerAction, updateDesignationAction } from './actions'

export interface DesignationRow {
  id: string
  name: string
  title: string
  authority: string
  adoptedOn: string
  endedOn: string | null
}

function DesignationFields({ current, today }: { current?: DesignationRow; today: string }) {
  return (
    <>
      <TextField
        label="Title"
        name="title"
        defaultValue={current?.title ?? 'Code Enforcement Officer'}
        required
      />
      <TextField
        label="Designated by"
        name="adoptingAuthority"
        defaultValue={current?.authority ?? 'Select Board'}
        required
      />
      <TextField
        label="Date adopted"
        name="adoptedOn"
        type="date"
        defaultValue={current?.adoptedOn ?? today}
        required
      />
    </>
  )
}

export function DesignateOfficer({
  staff,
  today,
}: {
  staff: readonly { id: string; name: string }[]
  today: string
}) {
  return (
    <FormDialog label="Designate an officer" title="Designate an officer" variant="default">
      <ActionForm action={designateOfficerAction} submitLabel="Designate officer">
        <SelectField
          label="Officer"
          name="userId"
          options={staff.map((s) => [s.id, s.name] as const)}
        />
        <DesignationFields today={today} />
      </ActionForm>
    </FormDialog>
  )
}

export function EditDesignation({ row, today }: { row: DesignationRow; today: string }) {
  return (
    <RowEditDialog
      record={`${row.name}'s designation`}
      title={`Edit ${row.name}'s designation`}
      description="To designate someone else, end this designation and designate them."
    >
      <ActionForm action={updateDesignationAction} submitLabel="Save changes">
        <input type="hidden" name="designationId" value={row.id} />
        <DesignationFields current={row} today={today} />
      </ActionForm>
    </RowEditDialog>
  )
}

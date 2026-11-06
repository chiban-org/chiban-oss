import { ActionForm } from '@/components/ActionForm'
import { FormDialog } from '@/components/FormDialog'
import { TextField } from '@/components/staff/fields'
import type { EndableKind } from '@/features/rosters/rosterEnd'
import { FORM_CLASS } from './AssociationForms'
import { endRosterEntryAction, undoRosterEndAction } from './rosterEndActions'

interface EndableRow {
  entryId: string
  name: string
  parcel: string
}

const ENDS: Record<EndableKind, { description: string; body: string; confirm: string }> = {
  association: {
    description: 'From this date its officers are no longer sent notice for this parcel.',
    body: 'Lists drawn on or after the date leave these officers off. Undo stays available until a list uses the ending.',
    confirm: 'End association',
  },
  park: {
    description:
      'From this date the park owner and tenants are no longer sent notice for this parcel.',
    body: 'Lists drawn on or after the date leave the park owner and tenants off. Undo stays available until a list uses the ending.',
    confirm: 'End park',
  },
}

export function EndEntry({
  row,
  kind,
  today,
}: {
  row: EndableRow
  kind: EndableKind
  today: string
}) {
  const copy = ENDS[kind]
  const title = `End ${row.name} on ${row.parcel}`
  return (
    <FormDialog
      label="End"
      accessibleLabel={title}
      title={title}
      description={copy.description}
      size="sm"
    >
      <ActionForm
        action={endRosterEntryAction}
        submitLabel={copy.confirm}
        variant="destructive"
        className={FORM_CLASS}
        confirm={{ title: `${title}?`, body: copy.body, confirmLabel: copy.confirm }}
      >
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="entryId" value={row.entryId} />
        <TextField label="End on" name="endedOn" type="date" defaultValue={today} required />
      </ActionForm>
    </FormDialog>
  )
}

export function UndoEntryEnd({ row, kind }: { row: EndableRow; kind: EndableKind }) {
  return (
    <ActionForm
      action={undoRosterEndAction}
      submitLabel="Undo ending"
      submitAccessibleLabel={`Undo ending ${row.name} on ${row.parcel}`}
      compact
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="entryId" value={row.entryId} />
    </ActionForm>
  )
}

export function EndOrUndo({
  row,
  kind,
  today,
}: {
  row: EndableRow & { endedOn: string | null; undoable: boolean }
  kind: EndableKind
  today: string
}) {
  if (row.endedOn === null) return <EndEntry row={row} kind={kind} today={today} />
  return row.undoable ? <UndoEntryEnd row={row} kind={kind} /> : null
}

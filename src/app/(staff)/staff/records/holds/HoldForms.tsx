import { ActionForm } from '@/components/ActionForm'
import { FormDialog } from '@/components/FormDialog'
import { SelectField, TextField } from '@/components/staff/fields'
import { placeHoldAction, releaseHoldAction } from '../actions'

const TARGETS: [string, string][] = [
  ['project', 'Project'],
  ['application', 'Application'],
  ['document', 'Document'],
  ['enforcement_case', 'Enforcement case'],
  ['rtk_request', 'Right-to-Know request'],
]
export function ReleaseHold({ holdId }: { holdId: string }) {
  return (
    <details>
      <summary>Release</summary>
      <ActionForm
        action={releaseHoldAction}
        submitLabel="Release hold"
        confirm={{
          title: 'Release this hold?',
          body: 'The records it covers are no longer protected from disposal by this hold.',
          confirmLabel: 'Release the hold',
        }}
      >
        <input type="hidden" name="holdId" value={holdId} />
        <TextField label="Release reason (at least 10 characters)" name="reason" required />
      </ActionForm>
    </details>
  )
}

export function PlaceHold() {
  return (
    <FormDialog label="Place a hold" title="Place a legal hold" variant="default">
      <ActionForm action={placeHoldAction} submitLabel="Place hold">
        <SelectField label="Hold on" name="targetKind" options={TARGETS} />
        <TextField
          label="Application number, case number, request number, project title, or document title"
          name="targetRef"
          required
        />
        <TextField label="Reason (at least 10 characters)" name="reason" required />
      </ActionForm>
    </FormDialog>
  )
}

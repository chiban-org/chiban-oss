import { ActionForm } from '@/components/ActionForm'
import type { ChecklistAction } from '@/components/documents/checklistTypes'
import { AreaField, SelectField } from '@/components/staff/fields'
import type { ChecklistFile } from '@/features/applications/documentChecklistView'
import { ITEM_REASON_MAX } from '@/features/applications/documentItemCopy'

function ItemFields({ applicationId, itemKey }: { applicationId: string; itemKey: string }) {
  return (
    <>
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="itemKey" value={itemKey} />
    </>
  )
}

export function UseExistingFile(props: {
  applicationId: string
  itemKey: string
  label: string
  choices: ChecklistFile[]
  action: ChecklistAction
  folded?: boolean
}) {
  if (props.choices.length === 0) return null
  const options = props.choices.map((f): [string, string] => [f.documentId, f.title])
  const form = (
    <ActionForm action={props.action} submitLabel="Use this file" compact className="grid gap-2">
      <ItemFields applicationId={props.applicationId} itemKey={props.itemKey} />
      <SelectField
        label={`Use a file already added for ${props.label}`}
        name="documentId"
        {...(props.folded === true
          ? { options: [['', 'Choose a file'], ...options], defaultValue: '', required: true }
          : { options })}
      />
    </ActionForm>
  )
  if (props.folded !== true) return form
  return (
    <details>
      <summary className="tap-target inline-flex cursor-pointer items-center">
        Use a file you already added
      </summary>
      {form}
    </details>
  )
}

export function RemoveFile(props: {
  applicationId: string
  itemKey: string
  file: ChecklistFile
  action: ChecklistAction
}) {
  return (
    <ActionForm
      action={props.action}
      submitLabel="Unassign"
      submitAccessibleLabel={`Unassign ${props.file.title} from this document`}
      compact
    >
      <ItemFields applicationId={props.applicationId} itemKey={props.itemKey} />
      <input type="hidden" name="documentId" value={props.file.documentId} />
    </ActionForm>
  )
}

export function ReasonForm(props: {
  applicationId: string
  itemKey: string
  summary: string
  reasonLabel: string
  submitLabel: string
  action: ChecklistAction
}) {
  return (
    <details>
      <summary className="tap-target inline-flex cursor-pointer items-center">
        {props.summary}
      </summary>
      <ActionForm
        action={props.action}
        submitLabel={props.submitLabel}
        compact
        className="grid gap-2"
      >
        <ItemFields applicationId={props.applicationId} itemKey={props.itemKey} />
        <AreaField
          label={props.reasonLabel}
          name="reason"
          required
          rows={2}
          maxLength={ITEM_REASON_MAX}
        />
      </ActionForm>
    </details>
  )
}

export function PlainItemAction(props: {
  applicationId: string
  itemKey: string
  submitLabel: string
  action: ChecklistAction
}) {
  return (
    <ActionForm action={props.action} submitLabel={props.submitLabel} compact>
      <ItemFields applicationId={props.applicationId} itemKey={props.itemKey} />
    </ActionForm>
  )
}

export function AssignFile(props: {
  applicationId: string
  file: ChecklistFile
  items: { key: string; label: string }[]
  action: ChecklistAction
}) {
  if (props.items.length === 0) return null
  return (
    <ActionForm action={props.action} submitLabel="Assign" compact className="grid gap-2">
      <input type="hidden" name="applicationId" value={props.applicationId} />
      <input type="hidden" name="documentId" value={props.file.documentId} />
      <SelectField
        label={`Assign ${props.file.title} to`}
        name="itemKey"
        options={props.items.map((i): [string, string] => [i.key, i.label])}
      />
    </ActionForm>
  )
}

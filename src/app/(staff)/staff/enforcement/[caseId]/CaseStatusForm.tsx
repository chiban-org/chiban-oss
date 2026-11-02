import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { CASE_TRANSITIONS } from '@/features/enforcement/cases'
import { CASE_STATUS_LABELS } from '@/features/enforcement/labels'
import { setCaseStatusAction } from '../actions'
import { Hidden } from './Section'

export function CaseStatusForm({ detail }: { detail: CaseDetail }) {
  const { row } = detail.staff
  const next = CASE_TRANSITIONS[row.status].filter((s) => s !== 'order_issued' && s !== 'in_court')
  if (next.length === 0) return null
  const options = next.map((s) => [s, CASE_STATUS_LABELS[s]] as [string, string])
  return (
    <ActionForm action={setCaseStatusAction} submitLabel="Change status">
      <Hidden name="caseId" value={row.id} />
      <Hidden name="expectedRowVersion" value={row.rowVersion} />
      <SelectField label="Move the case to" name="to" options={options} />
      <TextField label="Reason (needed to close)" name="reason" />
    </ActionForm>
  )
}

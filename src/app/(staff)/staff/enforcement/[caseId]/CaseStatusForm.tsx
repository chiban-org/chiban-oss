import { ActionForm } from '@/components/ActionForm'
import { NextStep } from '@/components/layout/NextStep'
import { SelectField, TextField } from '@/components/staff/fields'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { CASE_TRANSITIONS, STATUSES_SET_BY_THEIR_STEP } from '@/features/enforcement/cases'
import { CASE_STATUS_LABELS } from '@/features/enforcement/labels'
import { setCaseStatusAction } from '../actions'
import { Hidden } from './Section'

export function CaseStatusForm({ detail }: { detail: CaseDetail }) {
  const { row } = detail.staff
  const next = CASE_TRANSITIONS[row.status].filter(
    (s) => s !== 'violation_found' && !STATUSES_SET_BY_THEIR_STEP.includes(s),
  )
  if (next.length === 0) return null
  const options = next.map((s) => [s, CASE_STATUS_LABELS[s]] as [string, string])
  return (
    <NextStep>
      <ActionForm
        action={setCaseStatusAction}
        submitLabel="Change status"
        confirm={
          next.includes('closed')
            ? {
                title: 'Close this case?',
                body: 'The case is closed with your reason. A closed case cannot be moved to another status.',
                confirmLabel: 'Close the case',
                when: { name: 'to', oneOf: ['closed'] },
              }
            : undefined
        }
      >
        <Hidden name="caseId" value={row.id} />
        <Hidden name="expectedRowVersion" value={row.rowVersion} />
        <SelectField label="Move the case to" name="to" options={options} />
        <TextField
          label="Reason (needed to close)"
          name="reason"
          required={next.includes('closed')}
        />
      </ActionForm>
    </NextStep>
  )
}

import { ActionForm } from '@/components/ActionForm'
import { StatusChip } from '@/components/StatusChip'
import { CheckField, SelectField, TextField } from '@/components/staff/fields'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { TERMINAL_STATES } from '@/features/applications/states'
import { MAX_ADJUSTMENT_DAYS } from '@/features/clocks/adjustmentKinds'
import type { AdjustmentKind } from '@/features/clocks/explainClock'
import { partyLine, partyRoleLabel } from '@/features/projects/partyRoleLabels'
import { formatCivilDate } from '@/lib/formatDate'
import { markCompleteAction } from './actions'
import { adjustClockAction } from './clockFeeActions'
import { applyConditionAction, setConditionStatusAction } from './conditionActions'

export function PartiesPanel({ view }: { view: StaffApplicationView }) {
  return (
    <section aria-label="Parties" id="parties">
      <h2>Parties</h2>
      {view.parties.length === 0 ? <p>No parties are on this project.</p> : null}
      <ul>
        {view.parties.map((p) => (
          <li key={p.id}>
            {p.name === null
              ? `${partyRoleLabel(p.role)}, name not recorded`
              : partyLine(p.name, p.role)}
            {p.role === 'agent'
              ? p.ownerAuthorizationOnFile
                ? ', owner authorization on file'
                : ', no owner authorization'
              : ''}
            {p.linked ? '' : ', has not claimed this project yet'}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function completenessApplies(view: StaffApplicationView): boolean {
  return (
    view.classification === 'nh.building_permit' &&
    view.completedDate === null &&
    ['submitted', 'under_review'].includes(view.state)
  )
}

export function CompletenessPanel({ view }: { view: StaffApplicationView }) {
  const applies = completenessApplies(view)
  return (
    <section aria-label="Completeness" id="completeness">
      <h2>Completeness</h2>
      <p>
        {view.completedDate === null
          ? 'The application has not been marked complete, so the decision clock has not started.'
          : `Marked complete on ${formatCivilDate(view.completedDate)}.`}
      </p>
      {applies ? (
        <ActionForm action={markCompleteAction} submitLabel="Mark complete">
          <input type="hidden" name="applicationId" value={view.id} />
          <TextField
            label="Completed on"
            name="completedDate"
            type="date"
            defaultValue={view.today}
            required
          />
        </ActionForm>
      ) : null}
    </section>
  )
}

const ADJUSTMENT_OPTIONS: Record<AdjustmentKind, [string, string]> = {
  extension: ['extension', 'Extension'],
  waiver: ['waiver', 'Waiver'],
  statutory_exception: ['statutory_exception', 'Statutory exception (needs legal authority)'],
}

export function ClockAdjustForm({
  view,
  clockId,
  allowedKinds,
}: {
  view: StaffApplicationView
  clockId: string
  allowedKinds: AdjustmentKind[]
}) {
  const { canAdjustClock, canRecordStatutoryException } = view.permissions
  const offered = allowedKinds.filter((kind) =>
    kind === 'statutory_exception' ? canRecordStatutoryException : canAdjustClock,
  )
  if (offered.length === 0) return null
  return (
    <details className="my-2">
      <summary>Adjust this clock</summary>
      <ActionForm action={adjustClockAction} submitLabel="Apply adjustment">
        <input type="hidden" name="clockId" value={clockId} />
        <SelectField
          label="Kind"
          name="kind"
          options={offered.map((kind) => ADJUSTMENT_OPTIONS[kind])}
        />
        <TextField
          label="Days"
          name="days"
          type="number"
          min={1}
          max={MAX_ADJUSTMENT_DAYS}
          step={1}
        />
        <TextField label="Reason" name="reason" required />
        <TextField label="Legal authority: citation" name="citation" />
        <TextField label="Legal authority: explanation" name="explanation" />
        <CheckField label="The applicant consents" name="applicantConsent" />
      </ActionForm>
    </details>
  )
}

export function ConditionsPanel({ view }: { view: StaffApplicationView }) {
  const editable = view.permissions.canIssue && !TERMINAL_STATES.includes(view.state)
  const appliedCodes = new Set(view.conditions.map((c) => c.code))
  const available = view.conditionLibrary.filter((c) => !appliedCodes.has(c.code))
  return (
    <section aria-label="Conditions" id="conditions">
      <h2>Conditions</h2>
      {view.conditions.length === 0 ? <p>No conditions are applied.</p> : null}
      <ul className="list-none p-0">
        {view.conditions.map((c) => (
          <li
            key={c.id}
            className="record-item flex flex-wrap items-center justify-between gap-3 pb-3"
          >
            <span>
              {`${c.textSnapshot}${c.blocksIssuance ? ' (blocks issuance)' : ''}`}
              {c.statusReason === null ? '' : `. ${c.statusReason}`}
            </span>
            <span className="flex items-center gap-2">
              <StatusChip
                status={
                  c.status === 'unmet' ? 'overdue' : c.status === 'met' ? 'passed' : 'neutral'
                }
                label={c.status === 'unmet' ? 'Unmet' : c.status === 'met' ? 'Met' : 'Waived'}
              />
              {editable && c.status === 'unmet' ? (
                <ActionForm action={setConditionStatusAction} submitLabel="Mark met">
                  <input type="hidden" name="conditionId" value={c.id} />
                  <input type="hidden" name="status" value="met" />
                </ActionForm>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {!editable || available.length === 0 ? null : (
        <details>
          <summary>Apply a condition</summary>
          <ActionForm action={applyConditionAction} submitLabel="Apply condition">
            <input type="hidden" name="applicationId" value={view.id} />
            <SelectField
              label="Condition"
              name="code"
              options={available.map((c): [string, string] => [c.code, c.text])}
            />
          </ActionForm>
        </details>
      )}
    </section>
  )
}

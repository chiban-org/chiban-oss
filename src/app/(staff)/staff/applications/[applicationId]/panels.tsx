import { ActionForm } from '@/components/ActionForm'
import { StatusChip } from '@/components/StatusChip'
import { AreaField, CheckField, SelectField, TextField } from '@/components/staff/fields'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { TERMINAL_STATES } from '@/features/applications/states'
import { MAX_ADJUSTMENT_DAYS } from '@/features/clocks/adjustmentKinds'
import type { AdjustmentKind } from '@/features/clocks/explainClock'
import { MIN_WAIVER_REASON_LENGTH } from '@/features/conditions/conditionSchema'
import { partyLine, partyRoleLabel } from '@/features/projects/partyRoleLabels'
import { formatCivilDate } from '@/lib/formatDate'
import { markCompleteAction } from './actions'
import { adjustClockAction } from './clockFeeActions'
import { applyConditionAction, setConditionStatusAction } from './conditionActions'

function accountNote(party: StaffApplicationView['parties'][number]): string {
  if (party.account === null) return party.linked ? '' : ', has not claimed this project yet'
  const { email, companyName } = party.account
  return companyName === null
    ? `, linked to the account ${email}`
    : `, linked to the contractor account of ${companyName} (${email})`
}

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
            {accountNote(p)}
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

export function MarkCompleteForm({
  view,
  variant = 'outline',
}: {
  view: StaffApplicationView
  variant?: 'default' | 'outline'
}) {
  return (
    <ActionForm action={markCompleteAction} submitLabel="Mark complete" variant={variant}>
      <input type="hidden" name="applicationId" value={view.id} />
      <TextField
        label="Completed on"
        name="completedDate"
        type="date"
        defaultValue={view.today}
        required
      />
    </ActionForm>
  )
}

export function CompletenessPanel({
  view,
  formElsewhere = false,
}: {
  view: StaffApplicationView
  formElsewhere?: boolean
}) {
  return (
    <section aria-label="Completeness" id="completeness">
      <h2>Completeness</h2>
      <p>
        {view.completedDate === null
          ? 'The application has not been marked complete, so the decision clock has not started.'
          : `Marked complete on ${formatCivilDate(view.completedDate)}.`}
      </p>
      {completenessApplies(view) && !formElsewhere ? <MarkCompleteForm view={view} /> : null}
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

type AppliedCondition = StaffApplicationView['conditions'][number]

function WaiveCondition({ condition }: { condition: AppliedCondition }) {
  const required = condition.blocksIssuance
  return (
    <details>
      <summary className="text-sm">Waive</summary>
      <ActionForm action={setConditionStatusAction} submitLabel="Waive condition">
        <input type="hidden" name="conditionId" value={condition.id} />
        <input type="hidden" name="status" value="waived" />
        <AreaField
          label="Reason for waiving"
          name="reason"
          required={required}
          minLength={required ? MIN_WAIVER_REASON_LENGTH : undefined}
          maxLength={2000}
          hint={
            required
              ? `This condition blocks issuance. Explain why it is waived, in at least ${MIN_WAIVER_REASON_LENGTH} characters.`
              : 'Kept with the condition on the record.'
          }
        />
      </ActionForm>
    </details>
  )
}

function mayWaive(view: StaffApplicationView, condition: AppliedCondition): boolean {
  return !condition.blocksIssuance || view.permissions.canOverrideGate
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
              {editable && c.status === 'unmet' && mayWaive(view, c) ? (
                <WaiveCondition condition={c} />
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

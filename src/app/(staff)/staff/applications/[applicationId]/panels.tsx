import { ActionForm } from '@/components/ActionForm'
import { StatusChip } from '@/components/StatusChip'
import { SelectField, TextField } from '@/components/staff/fields'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { STATE_LABELS } from '@/features/applications/states'
import {
  applyConditionAction,
  markCompleteAction,
  setConditionStatusAction,
  setSubstepAction,
  transitionAction,
} from './actions'
import { adjustClockAction } from './clockFeeActions'

export function TransitionBar({ view }: { view: StaffApplicationView }) {
  const mayIssue = view.permissions.canIssue
  const allowed = view.nextTransitions.filter(
    (to) => mayIssue || !['issued', 'decided', 'denied'].includes(to),
  )
  return (
    <section aria-label="Next step" className="my-4 flex flex-wrap gap-3">
      {allowed.map((to, index) => (
        <ActionForm
          key={to}
          action={transitionAction}
          submitLabel={`Move to ${STATE_LABELS[to].toLowerCase()}`}
          variant={index === 0 ? 'default' : 'outline'}
        >
          <input type="hidden" name="applicationId" value={view.id} />
          <input type="hidden" name="to" value={to} />
          <input type="hidden" name="expectedRowVersion" value={view.rowVersion} />
        </ActionForm>
      ))}
      {view.substeps.length === 0 ? null : (
        <ActionForm action={setSubstepAction} submitLabel="Set step">
          <input type="hidden" name="applicationId" value={view.id} />
          <input type="hidden" name="expectedRowVersion" value={view.rowVersion} />
          <SelectField
            label="Step"
            name="substep"
            defaultValue={view.substep ?? ''}
            options={view.substeps.map((s): [string, string] => [s.key, s.label])}
          />
        </ActionForm>
      )}
    </section>
  )
}

export function PartiesPanel({ view }: { view: StaffApplicationView }) {
  return (
    <section aria-label="Parties">
      <h2>Parties</h2>
      {view.parties.length === 0 ? <p>No parties are on this project.</p> : null}
      <ul>
        {view.parties.map((p) => (
          <li key={p.id}>
            {`${p.name}, ${p.role}`}
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

export function CompletenessPanel({ view }: { view: StaffApplicationView }) {
  const applies =
    view.classification === 'nh.building_permit' &&
    view.completedDate === null &&
    ['submitted', 'under_review'].includes(view.state)
  return (
    <section aria-label="Completeness">
      <h2>Completeness</h2>
      <p>
        {view.completedDate === null
          ? 'The application has not been marked complete, so the decision clock has not started.'
          : `Marked complete on ${view.completedDate}.`}
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

export function ClockAdjustForm({
  view,
  clockId,
}: {
  view: StaffApplicationView
  clockId: string
}) {
  const { canAdjustClock, canRecordStatutoryException } = view.permissions
  if (!canAdjustClock && !canRecordStatutoryException) return null
  return (
    <details className="my-2">
      <summary>Adjust this clock</summary>
      <ActionForm action={adjustClockAction} submitLabel="Apply adjustment">
        <input type="hidden" name="clockId" value={clockId} />
        <SelectField
          label="Kind"
          name="kind"
          options={[
            ['extension', 'Extension'],
            ['waiver', 'Waiver'],
            ['statutory_exception', 'Statutory exception (needs legal authority)'],
          ]}
        />
        <TextField label="Days" name="days" type="number" />
        <TextField label="Reason" name="reason" required />
        <TextField label="Legal authority: citation" name="citation" />
        <TextField label="Legal authority: explanation" name="explanation" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="applicantConsent" />
          The applicant consents
        </label>
      </ActionForm>
    </details>
  )
}

export function ConditionsPanel({ view }: { view: StaffApplicationView }) {
  return (
    <section aria-label="Conditions">
      <h2>Conditions</h2>
      {view.conditions.length === 0 ? <p>No conditions are applied.</p> : null}
      <ul className="list-none p-0">
        {view.conditions.map((c) => (
          <li
            key={c.id}
            className="my-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-surface p-3"
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
              {c.status === 'unmet' ? (
                <ActionForm action={setConditionStatusAction} submitLabel="Mark met">
                  <input type="hidden" name="conditionId" value={c.id} />
                  <input type="hidden" name="status" value="met" />
                </ActionForm>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {view.conditionLibrary.length === 0 ? null : (
        <ActionForm action={applyConditionAction} submitLabel="Apply condition">
          <input type="hidden" name="applicationId" value={view.id} />
          <SelectField
            label="Condition"
            name="code"
            options={view.conditionLibrary.map((c): [string, string] => [c.code, c.text])}
          />
        </ActionForm>
      )}
    </section>
  )
}

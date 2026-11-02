import { ActionForm } from '@/components/ActionForm'
import { StatusChip } from '@/components/StatusChip'
import { SelectField, TextField } from '@/components/staff/fields'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { STATE_LABELS } from '@/features/applications/states'
import { formatCents } from '@/lib/money'
import {
  adjustClockAction,
  applyConditionAction,
  feeOverrideAction,
  markCompleteAction,
  recordAppealAction,
  recordCodeEditionAction,
  regionalImpactAction,
  regionalNoticeAction,
  renewAction,
  resolveAppealAction,
  setConditionStatusAction,
  setSubstepAction,
  transitionAction,
} from './actions'

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

export function FeeOverrideForm({ view }: { view: StaffApplicationView }) {
  if (!view.permissions.canOverrideFee) return null
  const codes = view.fees.preview?.lines.map((l) => l.code) ?? [
    ...new Set(
      view.fees.assessments.flatMap((a) =>
        (a.computation as { lines: { code: string }[] }).lines.map((l) => l.code),
      ),
    ),
  ]
  if (codes.length === 0) return null
  return (
    <details className="my-2">
      <summary>Waive or set a fee</summary>
      <ActionForm action={feeOverrideAction} submitLabel="Save fee override">
        <input type="hidden" name="applicationId" value={view.id} />
        <SelectField
          label="Fee"
          name="feeCode"
          options={codes.map((c): [string, string] => [c, c])}
        />
        <SelectField
          label="Override"
          name="kind"
          options={[
            ['waive', 'Waive'],
            ['set_amount', 'Set an amount'],
          ]}
        />
        <TextField label="Amount in dollars (for a set amount)" name="amount" inputMode="decimal" />
        <TextField label="Reason" name="reason" required />
      </ActionForm>
      {view.fees.overrides.map((o) => (
        <p
          key={o.id}
          className="text-sm"
        >{`${o.feeCode}: ${o.kind === 'waive' ? 'waived' : `set to ${formatCents(o.amountCents ?? 0)}`}. ${o.reason}`}</p>
      ))}
    </details>
  )
}

export function CodeEditionPanel({ view }: { view: StaffApplicationView }) {
  const edition = view.codeEdition
  if (view.classification !== 'nh.building_permit') return null
  return (
    <section aria-label="Code edition">
      <h2>State building code edition</h2>
      {edition === null ? (
        <p>No code edition is recorded. Issuance is blocked until one is.</p>
      ) : (
        <>
          <p>
            <strong>{edition.description.label}</strong>
            {edition.description.status === 'unverified' ? (
              <StatusChip status="overdue" label="Edition not verified" />
            ) : null}
          </p>
          {edition.description.components.length === 0 ? null : (
            <p>{edition.description.components.join(', ')}</p>
          )}
          {edition.description.amendmentPackagesInForce.map((label) => (
            <p key={label} className="m-0">
              {label}
            </p>
          ))}
          <dl className="grid grid-cols-[12rem_1fr] gap-x-4 text-sm">
            {edition.rows.map((r) => (
              <div key={r.field} className="contents">
                <dt className="font-medium">{r.field}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {view.state === 'draft' || view.permissions.canIssue === false ? null : (
        <ActionForm
          action={recordCodeEditionAction}
          submitLabel={edition === null ? 'Record code edition' : 'Record again'}
        >
          <input type="hidden" name="applicationId" value={view.id} />
          <TextField
            label="Applicant election (edition key, only inside the concurrency period)"
            name="election"
          />
        </ActionForm>
      )}
    </section>
  )
}

export function RegionalImpactPanel({ view }: { view: StaffApplicationView }) {
  const { regionalImpact: r } = view
  if (!r.applies) return null
  return (
    <section aria-label="Regional impact">
      <h2>Regional impact</h2>
      <p>
        {r.determination === null
          ? 'No determination is recorded. Issuance is blocked until one is.'
          : `Determination: ${r.determination.determination.replaceAll('_', ' ')} on ${r.determination.determinedOn}${r.determination.previousBoardRef === null ? '' : ` (board reference ${r.determination.previousBoardRef})`}.`}
      </p>
      {view.permissions.canDetermineRegionalImpact ? (
        <ActionForm action={regionalImpactAction} submitLabel="Record determination">
          <input type="hidden" name="applicationId" value={view.id} />
          <SelectField
            label="Determination"
            name="determination"
            options={[
              ['yes', 'Potential regional impact'],
              ['no', 'No regional impact'],
              ['previously_determined', 'Previously determined by another board'],
            ]}
          />
          <TextField label="Board reference (if previously determined)" name="previousBoardRef" />
          <TextField
            label="Determined on"
            name="determinedOn"
            type="date"
            defaultValue={view.today}
            required
          />
        </ActionForm>
      ) : null}
      {r.notices.length === 0 ? null : (
        <ul>
          {r.notices.map((n) => (
            <li
              key={n.id}
            >{`${n.recipientName} (${n.recipientKind.replaceAll('_', ' ')}), ${n.method.replaceAll('_', ' ')}, mailed ${n.mailedOn}`}</li>
          ))}
        </ul>
      )}
      {r.determination?.determination === 'yes' && view.permissions.canDetermineRegionalImpact ? (
        <ActionForm action={regionalNoticeAction} submitLabel="Record notice">
          <input type="hidden" name="applicationId" value={view.id} />
          <SelectField
            label="Recipient"
            name="recipientKind"
            options={[
              ['regional_planning_commission', 'Regional planning commission'],
              ['affected_municipality', 'Affected municipality'],
              ['governing_body', 'Local governing body'],
            ]}
          />
          <TextField label="Recipient name" name="recipientName" required />
          <SelectField
            label="Method"
            name="method"
            options={[
              ['certified_mail', 'Certified mail'],
              ['hand_delivery', 'Hand delivery'],
              ['email', 'Email'],
              ['other', 'Other'],
            ]}
          />
          <TextField
            label="Mailed on"
            name="mailedOn"
            type="date"
            defaultValue={view.today}
            required
          />
          <TextField label="Reference (tracking number)" name="reference" />
        </ActionForm>
      ) : null}
    </section>
  )
}

export function AppealPanel({ view }: { view: StaffApplicationView }) {
  const open = view.appeals.find((a) => a.resolvedOn === null)
  return (
    <section aria-label="Appeals and renewal">
      <h2>Appeals and renewal</h2>
      {view.appeals.length === 0 ? <p>No appeal has been filed.</p> : null}
      <ul>
        {view.appeals.map((a) => (
          <li
            key={a.id}
          >{`Filed ${a.filedOn} by ${a.appellantName}. ${a.resolvedOn === null ? 'Open.' : `Resolved ${a.resolvedOn}: ${a.outcome?.replaceAll('_', ' ')}.`}`}</li>
        ))}
      </ul>
      {view.state === 'issued' && view.permissions.canIssue ? (
        <>
          <ActionForm action={recordAppealAction} submitLabel="Record appeal">
            <input type="hidden" name="applicationId" value={view.id} />
            <TextField label="Appellant" name="appellantName" required />
            <TextField
              label="Filed on"
              name="filedOn"
              type="date"
              defaultValue={view.today}
              required
            />
          </ActionForm>
          <ActionForm action={renewAction} submitLabel="Renew permit">
            <input type="hidden" name="applicationId" value={view.id} />
            <TextField
              label="Renewed on"
              name="renewedOn"
              type="date"
              defaultValue={view.today}
              required
            />
          </ActionForm>
        </>
      ) : null}
      {open !== undefined && view.permissions.canIssue ? (
        <ActionForm action={resolveAppealAction} submitLabel="Resolve appeal">
          <input type="hidden" name="applicationId" value={view.id} />
          <SelectField
            label="Outcome"
            name="outcome"
            options={[
              ['permit_upheld', 'Permit upheld'],
              ['permit_revoked', 'Permit revoked'],
            ]}
          />
          <TextField
            label="Resolved on"
            name="resolvedOn"
            type="date"
            defaultValue={view.today}
            required
          />
        </ActionForm>
      ) : null}
    </section>
  )
}

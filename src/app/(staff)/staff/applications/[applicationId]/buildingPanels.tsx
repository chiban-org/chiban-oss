import { ActionForm } from '@/components/ActionForm'
import { StatusChip } from '@/components/StatusChip'
import { SelectField, TextField } from '@/components/staff/fields'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { componentsNotInLabel } from '@/features/building/codeEdition'
import {
  APPEAL_OUTCOME_OPTIONS,
  DETERMINATION_OPTIONS,
  labelFor,
  NOTICE_METHOD_OPTIONS,
  RECIPIENT_KIND_OPTIONS,
} from '@/features/building/labels'
import { REGIONAL_IMPACT_OPEN_STATES } from '@/features/building/regionalImpactStates'
import { loadPack } from '@/features/packs/loadPack'
import { formatCivilDate, humanizeIsoDates } from '@/lib/formatDate'
import { lowerFirst } from '@/lib/words'
import { recordCodeEditionAction } from './actions'
import {
  recordAppealAction,
  regionalImpactAction,
  regionalNoticeAction,
  renewAction,
  resolveAppealAction,
} from './buildingActions'

const ELECTION_NONE: [string, string] = ['', 'No election: use the edition in force']

function electionOptions(): [string, string][] {
  return loadPack()
    .codeEditions.filter((e) => e.status === 'verified')
    .map((e): [string, string] => [e.key, humanizeIsoDates(e.label)])
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
            <strong>{humanizeIsoDates(edition.description.label)}</strong>
            {edition.description.status === 'unverified' ? (
              <StatusChip status="overdue" label="Edition not verified" />
            ) : null}
          </p>
          {componentsNotInLabel(edition.description).length === 0 ? null : (
            <p>{componentsNotInLabel(edition.description).join(', ')}</p>
          )}
          {edition.description.amendmentPackagesInForce.map((label) => (
            <p key={label} className="m-0">
              {humanizeIsoDates(label)}
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
          <SelectField
            label="Applicant election, only inside the overlap period"
            name="election"
            options={[ELECTION_NONE, ...electionOptions()]}
          />
        </ActionForm>
      )}
    </section>
  )
}

export function RegionalImpactPanel({ view }: { view: StaffApplicationView }) {
  const { regionalImpact: r } = view
  if (!r.applies) return null
  const editable =
    view.permissions.canDetermineRegionalImpact && REGIONAL_IMPACT_OPEN_STATES.includes(view.state)
  return (
    <section aria-label="Regional impact">
      <h2>Regional impact</h2>
      <p>
        {r.determination === null
          ? 'No determination is recorded. Issuance is blocked until one is.'
          : `Determination: ${lowerFirst(labelFor(DETERMINATION_OPTIONS, r.determination.determination))} on ${formatCivilDate(r.determination.determinedOn)}${r.determination.previousBoardRef === null ? '' : ` (board reference ${r.determination.previousBoardRef})`}.`}
      </p>
      {editable ? (
        <ActionForm action={regionalImpactAction} submitLabel="Record determination">
          <input type="hidden" name="applicationId" value={view.id} />
          <SelectField label="Determination" name="determination" options={DETERMINATION_OPTIONS} />
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
            >{`${n.recipientName} (${lowerFirst(labelFor(RECIPIENT_KIND_OPTIONS, n.recipientKind))}), ${lowerFirst(labelFor(NOTICE_METHOD_OPTIONS, n.method))}, mailed ${formatCivilDate(n.mailedOn)}`}</li>
          ))}
        </ul>
      )}
      {r.determination?.determination === 'yes' && editable ? (
        <ActionForm action={regionalNoticeAction} submitLabel="Record notice">
          <input type="hidden" name="applicationId" value={view.id} />
          <SelectField label="Recipient" name="recipientKind" options={RECIPIENT_KIND_OPTIONS} />
          <TextField label="Recipient name" name="recipientName" required />
          <SelectField label="Method" name="method" options={NOTICE_METHOD_OPTIONS} />
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
          >{`Filed ${formatCivilDate(a.filedOn)} by ${a.appellantName}. ${a.resolvedOn === null ? 'Open.' : `Resolved ${formatCivilDate(a.resolvedOn)}: ${lowerFirst(labelFor(APPEAL_OUTCOME_OPTIONS, a.outcome ?? ''))}.`}`}</li>
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
          <SelectField label="Outcome" name="outcome" options={APPEAL_OUTCOME_OPTIONS} />
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

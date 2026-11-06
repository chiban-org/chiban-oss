import { ActionForm } from '@/components/ActionForm'
import { AmendmentText } from '@/components/config/TextDiff'
import { StatusChip } from '@/components/StatusChip'
import { SelectField, TextField } from '@/components/staff/fields'
import { DescriptionList } from '@/components/ui/description-list'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { componentsNotInLabel } from '@/features/building/codeEdition'
import {
  DETERMINATION_OPTIONS,
  labelFor,
  NOTICE_METHOD_OPTIONS,
  RECIPIENT_KIND_OPTIONS,
} from '@/features/building/labels'
import { formatCivilDate, humanizeIsoDates } from '@/lib/formatDate'
import { lowerFirst } from '@/lib/words'
import { regionalNoticeAction } from './buildingActions'
import {
  CodeEditionForm,
  codeEditionEditable,
  RegionalDeterminationForm,
  regionalImpactEditable,
} from './buildingForms'

export function CodeEditionPanel({
  view,
  formElsewhere = false,
}: {
  view: StaffApplicationView
  formElsewhere?: boolean
}) {
  const edition = view.codeEdition
  if (view.classification !== 'nh.building_permit') return null
  return (
    <section aria-label="Code edition" id="code-edition">
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
            <p key={label}>{humanizeIsoDates(label)}</p>
          ))}
          <DescriptionList
            labelWidth="wide"
            className="text-sm"
            items={edition.rows.map((r) => ({ label: r.field, value: r.value }))}
          />
          {edition.amendments.map((a) =>
            a.stateText === undefined && a.townText === undefined ? null : (
              <details key={a.key} className="my-2">
                <summary>{`${a.title} (${a.codeSection}): what the town changed`}</summary>
                <div className="mt-2">
                  <AmendmentText stateText={a.stateText} townText={a.townText} />
                </div>
              </details>
            ),
          )}
        </>
      )}
      {!codeEditionEditable(view) || formElsewhere ? null : (
        <details>
          <summary>
            {edition === null ? 'Record the code edition' : 'Record the edition again'}
          </summary>
          <CodeEditionForm view={view} />
        </details>
      )}
    </section>
  )
}

export function RegionalImpactPanel({
  view,
  formElsewhere = false,
}: {
  view: StaffApplicationView
  formElsewhere?: boolean
}) {
  const { regionalImpact: r } = view
  if (!r.applies) return null
  const editable = regionalImpactEditable(view)
  return (
    <section aria-label="Regional impact" id="regional-impact">
      <h2>Regional impact</h2>
      <p>
        {r.determination === null
          ? 'No determination is recorded. Issuance is blocked until one is.'
          : `Determination: ${lowerFirst(labelFor(DETERMINATION_OPTIONS, r.determination.determination))} on ${formatCivilDate(r.determination.determinedOn)}${r.determination.previousBoardRef === null ? '' : ` (board reference ${r.determination.previousBoardRef})`}.`}
      </p>
      {editable && !formElsewhere ? (
        <details>
          <summary>Record a determination</summary>
          <RegionalDeterminationForm view={view} />
        </details>
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
        <details>
          <summary>Record a notice</summary>
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
        </details>
      ) : null}
    </section>
  )
}

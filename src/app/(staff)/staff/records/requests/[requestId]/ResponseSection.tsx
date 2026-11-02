import { NH_RTK_EXEMPTIONS, OTHER_LAW_EXEMPTION_KEY } from '@packs/nh/rtkExemptions'
import { ActionForm } from '@/components/ActionForm'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import { costTotal, RTK_RESPONSE_LABELS, RTK_SCOPE_LABELS } from '@/features/rtk/labels'
import type { RtkRequestView } from '@/features/rtk/requests'
import { exemptionLabel } from '@/features/rtk/responseLetter'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'
import { closeRequestAction, firstResponseAction, withholdingAction } from '../actions'

const EXEMPTION_OPTIONS: [string, string][] = [
  ...NH_RTK_EXEMPTIONS.map((e) => [e.key, `${e.citation.label}: ${e.label}`] as [string, string]),
  [OTHER_LAW_EXEMPTION_KEY, 'Made confidential by another law'],
]

const FORM_RESPONSE_OPTIONS = Object.entries<string>(RTK_RESPONSE_LABELS).filter(
  ([kind]) => kind !== 'made_available',
)

function Hidden({ name, value }: { name: string; value: string | number }) {
  return <input type="hidden" name={name} value={String(value)} />
}

export function ResponseSection({ request, today }: { request: RtkRequestView; today: CivilDate }) {
  return (
    <>
      <section aria-labelledby="withholdings" className="space-y-3 border-t pt-4">
        <h2 id="withholdings">Records withheld or redacted</h2>
        {request.withholdings.length === 0 ? (
          <p>Nothing has been withheld.</p>
        ) : (
          <ul className="m-0 list-none space-y-2 p-0">
            {request.withholdings.map((w) => {
              const e = exemptionLabel(w)
              return (
                <li key={w.id} className="rounded-md border p-3">
                  <p className="m-0 font-medium">{`${w.recordDescription} (${RTK_SCOPE_LABELS[w.scope]})`}</p>
                  <p className="m-0">{`${e.label}, ${e.citation}`}</p>
                  <p className="m-0">{w.explanation}</p>
                </li>
              )
            })}
          </ul>
        )}
        {request.status === 'closed' || request.status === 'withdrawn' ? null : (
          <ActionForm action={withholdingAction} submitLabel="Record withholding">
            <Hidden name="requestId" value={request.id} />
            <SelectField
              label="Record is"
              name="scope"
              options={[
                ['withheld_in_full', RTK_SCOPE_LABELS.withheld_in_full],
                ['redacted', RTK_SCOPE_LABELS.redacted],
              ]}
            />
            <TextField label="Which record" name="recordDescription" required />
            <SelectField label="Exemption" name="exemptionKey" options={EXEMPTION_OPTIONS} />
            <TextField label="Law, if made confidential by another law" name="otherCitation" />
            <AreaField
              label="How the exemption applies (a sentence or two)"
              name="explanation"
              rows={3}
              required
            />
          </ActionForm>
        )}
      </section>
      <section aria-labelledby="first-response" className="space-y-3 border-t pt-4">
        <h2 id="first-response">First response</h2>
        {request.firstResponseKind === null ? (
          <ActionForm action={firstResponseAction} submitLabel="Record response">
            <Hidden name="requestId" value={request.id} />
            <p className="m-0">
              To make records available, approve and release them under Releases. The first
              release records the response.
            </p>
            <SelectField label="Response" name="kind" options={FORM_RESPONSE_OPTIONS} />
            <TextField
              label="Date of response"
              name="respondedOn"
              type="date"
              defaultValue={today}
              required
            />
            <TextField label="Web address, if posted online" name="websiteUrl" type="url" />
            <TextField
              label="Date the town will respond by, if more time is needed"
              name="statedDate"
              type="date"
            />
            <AreaField label="Why more time is needed" name="delayReason" rows={2} />
            <TextField label="Charge, if any (what it is for)" name="costLabel" />
            <TextField
              label="Charge in dollars"
              name="costDollars"
              type="number"
              min="0"
              step="0.01"
            />
          </ActionForm>
        ) : (
          <>
            <p className="m-0">
              {`${RTK_RESPONSE_LABELS[request.firstResponseKind as keyof typeof RTK_RESPONSE_LABELS]}, ${request.firstResponseOn === null ? '' : formatCivilDate(request.firstResponseOn)}.`}
            </p>
            {request.timeStatements.map((s) => (
              <p key={s.id} className="m-0">
                {`More time needed until ${formatCivilDate(s.statedDate)}: ${s.delayReason}${s.costEstimate.length > 0 ? ` Estimated charge ${costTotal(s.costEstimate)}.` : ''}`}
              </p>
            ))}
          </>
        )}
        {request.status === 'closed' || request.status === 'withdrawn' ? null : (
          <ActionForm action={closeRequestAction} submitLabel="Update request">
            <Hidden name="requestId" value={request.id} />
            <Hidden name="expectedRowVersion" value={request.rowVersion} />
            <SelectField
              label="Close the request as"
              name="to"
              options={[
                ['closed', 'Closed'],
                ['withdrawn', 'Withdrawn by the requester'],
              ]}
            />
          </ActionForm>
        )}
      </section>
    </>
  )
}

import { ActionForm } from '@/components/ActionForm'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import { exemptionChoices } from '@/features/rtk/exemptions'
import { RTK_SCOPE_LABELS } from '@/features/rtk/labels'
import type { RtkRequestView } from '@/features/rtk/requests'
import { exemptionLabel } from '@/features/rtk/responseLetter'
import { withholdingAction } from '../actions'

function exemptionOptions(): [string, string][] {
  return [
    ['', 'Choose an exemption'],
    ...exemptionChoices().map((e): [string, string] => [e.key, e.label]),
  ]
}

function WithholdingForm({ requestId }: { requestId: string }) {
  return (
    <details>
      <summary>Record a withholding</summary>
      <ActionForm action={withholdingAction} submitLabel="Record withholding">
        <input type="hidden" name="requestId" value={requestId} />
        <SelectField
          label="Record is"
          name="scope"
          options={[
            ['withheld_in_full', RTK_SCOPE_LABELS.withheld_in_full],
            ['redacted', RTK_SCOPE_LABELS.redacted],
          ]}
        />
        <TextField label="Which record" name="recordDescription" required />
        <SelectField
          label="Exemption"
          name="exemptionKey"
          options={exemptionOptions()}
          defaultValue=""
          required
        />
        <TextField label="Law, if made confidential by another law" name="otherCitation" />
        <AreaField
          label="How the exemption applies (a sentence or two)"
          name="explanation"
          rows={3}
          required
        />
      </ActionForm>
    </details>
  )
}

export function WithholdingsSection({
  request,
  working,
}: {
  request: RtkRequestView
  working: boolean
}) {
  return (
    <section aria-labelledby="withholdings">
      <h2 id="withholdings">Records withheld or redacted</h2>
      {request.withholdings.length === 0 ? (
        <p>Nothing has been withheld.</p>
      ) : (
        <ul className="list-none space-y-3 p-0">
          {request.withholdings.map((w) => {
            const e = exemptionLabel(w)
            return (
              <li key={w.id} className="record-item">
                <p className="m-0 font-medium">{`${w.recordDescription} (${RTK_SCOPE_LABELS[w.scope]})`}</p>
                <p className="m-0">{`${e.label}, ${e.citation}`}</p>
                <p className="m-0">{w.explanation}</p>
              </li>
            )
          })}
        </ul>
      )}
      {working ? <WithholdingForm requestId={request.id} /> : null}
    </section>
  )
}

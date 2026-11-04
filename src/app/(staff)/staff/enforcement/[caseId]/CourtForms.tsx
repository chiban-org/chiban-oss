import { ActionForm } from '@/components/ActionForm'
import { NEW_TAB } from '@/components/newTab'
import { SelectField, TextField } from '@/components/staff/fields'
import type { CaseDetail, OrderDetail } from '@/features/enforcement/caseDetail'
import { COURT_STEP_LABELS, JUDGMENT_OUTCOME_LABELS } from '@/features/enforcement/labels'
import { formatCivilDate } from '@/lib/formatDate'
import { courtStepAction } from '../serviceActions'
import { Hidden } from './Section'

const STEPS = Object.entries(COURT_STEP_LABELS) as [string, string][]
const OUTCOMES: [string, string][] = [
  ['', 'Not a judgment'],
  ...(Object.entries(JUDGMENT_OUTCOME_LABELS) as [string, string][]),
]

export function CourtForms({ order, detail }: { order: OrderDetail; detail: CaseDetail }) {
  const docs: [string, string][] = detail.documents
    .filter((d) => d.docKind === 'court_document')
    .map((d) => [d.documentId, d.title])
  return (
    <div className="space-y-3">
      {order.steps.length === 0 ? <p>No court step has been recorded.</p> : null}
      <ul className="m-0 list-none space-y-1 p-0">
        {order.steps.map((s) => (
          <li key={s.id}>
            {`${formatCivilDate(s.occurredOn)}: ${COURT_STEP_LABELS[s.kind]}, ${s.court}${s.docket === null ? '' : `, docket ${s.docket}`}${s.judgmentOutcome === null ? '' : `, ${JUDGMENT_OUTCOME_LABELS[s.judgmentOutcome].toLowerCase()}`}. `}
            <a
              {...NEW_TAB}
              href={`/api/documents/${s.documentId}`}
              className="text-action underline"
            >
              Open document
            </a>
          </li>
        ))}
      </ul>
      <details>
        <summary className="cursor-pointer font-medium">Record a court step</summary>
        <p className="m-0">
          Upload the court document in the Documents section first, as a court document.
        </p>
        <ActionForm action={courtStepAction} submitLabel="Record court step">
          <Hidden name="orderId" value={order.row.id} />
          <SelectField label="Step" name="kind" options={STEPS} />
          <TextField
            label="Date"
            name="occurredOn"
            type="date"
            defaultValue={detail.today}
            required
          />
          <TextField label="Court" name="court" required />
          <TextField label="Docket number" name="docket" />
          <SelectField label="Court document" name="documentId" options={docs} />
          <SelectField label="Judgment result" name="judgmentOutcome" options={OUTCOMES} />
        </ActionForm>
      </details>
    </div>
  )
}

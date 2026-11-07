import { ActionForm } from '@/components/ActionForm'
import { NEW_TAB } from '@/components/newTab'
import { SelectField, TextField } from '@/components/staff/fields'
import type { CaseDetail, OrderDetail } from '@/features/enforcement/caseDetail'
import { COURT_STEP_LABELS, JUDGMENT_OUTCOME_LABELS } from '@/features/enforcement/labels'
import type { CourtStepKind } from '@/features/enforcement/workPlanTypes'
import { formatCivilDate } from '@/lib/formatDate'
import { courtStepAction } from '../serviceActions'
import { Hidden } from './Section'

const STEPS = Object.entries(COURT_STEP_LABELS) as [string, string][]
const OUTCOMES: [string, string][] = [
  ['', 'Not a judgment'],
  ...(Object.entries(JUDGMENT_OUTCOME_LABELS) as [string, string][]),
]

type Variant = 'default' | 'outline'

export function CourtStepForm({
  order,
  detail,
  step,
  variant,
}: {
  order: OrderDetail
  detail: CaseDetail
  step?: CourtStepKind
  variant: Variant
}) {
  const docs: [string, string][] = detail.documents
    .filter((d) => d.docKind === 'court_document')
    .map((d) => [d.documentId, d.title])
  return (
    <>
      <p className="m-0">
        Upload the court document in the Documents section first, as a court document.
      </p>
      <ActionForm action={courtStepAction} submitLabel="Record court step" variant={variant}>
        <Hidden name="orderId" value={order.row.id} />
        <SelectField label="Step" name="kind" options={STEPS} defaultValue={step} />
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
    </>
  )
}

export function CourtForms({
  order,
  detail,
  hosted,
}: {
  order: OrderDetail
  detail: CaseDetail
  hosted?: ReadonlySet<string>
}) {
  return (
    <div className="space-y-3">
      {order.steps.length === 0 ? <p>No court step has been recorded.</p> : null}
      <ul className="list-none space-y-1 p-0">
        {order.steps.map((s) => (
          <li key={s.id}>
            {`${formatCivilDate(s.occurredOn)}: ${COURT_STEP_LABELS[s.kind]}, ${s.court}${s.docket === null ? '' : `, docket ${s.docket}`}${s.judgmentOutcome === null ? '' : `, ${JUDGMENT_OUTCOME_LABELS[s.judgmentOutcome].toLowerCase()}`}. `}
            <a {...NEW_TAB} href={`/api/documents/${s.documentId}`}>
              Open document
            </a>
          </li>
        ))}
      </ul>
      {hosted?.has(`record_court_step:${order.row.id}`) === true ? null : (
        <details>
          <summary className="cursor-pointer font-medium">Record a court step</summary>
          <CourtStepForm order={order} detail={detail} variant="outline" />
        </details>
      )}
    </div>
  )
}

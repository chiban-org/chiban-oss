import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { FINE_KIND_LABELS } from '@/features/enforcement/labels'
import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'
import { fineAction, finePaymentAction } from '../moneyActions'
import type { Can } from './can'
import { Hidden, Section } from './Section'

const KINDS = Object.entries(FINE_KIND_LABELS) as [string, string][]
const METHODS: [string, string][] = [
  ['cash', 'Cash'],
  ['check', 'Check'],
]

export function MoneySection({ detail, can }: { detail: CaseDetail; can: Can }) {
  const judgments = detail.orders.flatMap((o) =>
    o.steps
      .filter((s) => s.kind === 'judgment' && s.judgmentOutcome !== 'annulled')
      .map(
        (s) =>
          [
            `${o.row.id}:${s.id}`,
            `Judgment on order ${o.row.number}, ${formatCivilDate(s.occurredOn)}`,
          ] as [string, string],
      ),
  )
  const wins: [string, string][] = detail.referrals.flatMap((r) =>
    r.outcomes
      .filter((o) => o.kind === 'judgment_for_town')
      .map(
        (o) =>
          [`counsel:${o.id}`, `Judgment for the town, ${formatCivilDate(o.occurredOn)}`] as [
            string,
            string,
          ],
      ),
  )
  const bases: [string, string][] = [...judgments, ...wins]
  return (
    <Section id="fines" title="Fines">
      {detail.stay.stayed ? (
        <p className="m-0 font-medium">
          Fines cannot be recorded while the appeal stay is in effect.
        </p>
      ) : null}
      {detail.fines.length === 0 ? <p>No fine has been imposed by a court.</p> : null}
      {detail.fines.map((f) => (
        <article key={f.row.id} className="space-y-2 rounded-md border p-3">
          <p className="m-0 font-medium">{`${FINE_KIND_LABELS[f.row.kind]}, ${formatCents(f.row.amountCents)}, imposed ${formatCivilDate(f.row.imposedOn)} by ${f.row.court}, docket ${f.row.docket}`}</p>
          <p className="m-0">{`Paid ${formatCents(f.paidCents)}. Balance due ${formatCents(f.dueCents)}.`}</p>
          {can.collect && f.dueCents > 0 ? (
            <ActionForm action={finePaymentAction} submitLabel="Record payment">
              <Hidden name="fineId" value={f.row.id} />
              <TextField
                label="Amount in dollars"
                name="dollars"
                type="number"
                step="0.01"
                min="0.01"
                required
              />
              <SelectField label="Paid by" name="method" options={METHODS} />
              <TextField label="Check number" name="checkNumber" />
              <TextField label="Payer name" name="payerName" required />
            </ActionForm>
          ) : null}
        </article>
      ))}
      {detail.exposure === null ? null : (
        <div className="rounded-md border p-3">
          <p className="m-0 font-medium">{detail.exposure.label}</p>
          <p className="m-0">
            {detail.exposure.fromDate === null
              ? 'Accrual has not started: no written notice has been received and no conviction has been recorded.'
              : `Accrual began ${formatCivilDate(detail.exposure.fromDate)}. ${detail.exposure.days} ${detail.exposure.days === 1 ? 'day' : 'days'}, estimated ${formatCents(detail.exposure.cents)}.`}
          </p>
        </div>
      )}
      {can.fine && bases.length > 0 && !detail.stay.stayed ? (
        <details>
          <summary className="cursor-pointer font-medium">Record a court-imposed fine</summary>
          <ActionForm action={fineAction} submitLabel="Record fine">
            <Hidden name="caseId" value={detail.staff.row.id} />
            <SelectField label="Based on" name="basis" options={bases} />
            <SelectField label="Kind" name="kind" options={KINDS} />
            <TextField
              label="Amount in dollars"
              name="dollars"
              type="number"
              step="0.01"
              min="0.01"
              required
            />
            <TextField
              label="Date imposed"
              name="imposedOn"
              type="date"
              defaultValue={detail.today}
              required
            />
            <TextField label="Court" name="court" required />
            <TextField label="Docket number" name="docket" required />
          </ActionForm>
        </details>
      ) : null}
    </Section>
  )
}

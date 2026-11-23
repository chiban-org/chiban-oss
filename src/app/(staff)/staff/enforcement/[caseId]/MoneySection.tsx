import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { FINE_KIND_LABELS } from '@/features/enforcement/labels'
import {
  PENALTY_EXPOSURE_AFTER_FINE_LABEL,
  type PenaltyExposure,
  penaltyRangeLines,
} from '@/features/enforcement/penaltyExposure'
import { NO_HOSTED } from '@/features/enforcement/workPlanTypes'
import { dayCount } from '@/lib/dayCount'
import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'
import { fineAction, finePaymentAction } from '../moneyActions'
import type { Can } from './can'
import { FinePayments } from './FinePayments'
import { Hidden, Section } from './Section'

const KINDS = Object.entries(FINE_KIND_LABELS) as [string, string][]
const METHODS: [string, string][] = [
  ['cash', 'Cash'],
  ['check', 'Check'],
]

const ACCRUAL_NOT_STARTED =
  'Accrual has not started: no written notice has been received and no conviction has been recorded.'

function accrualDays(fromDate: string, days: number): string {
  return `Accrual began ${formatCivilDate(fromDate)}. ${dayCount(days)}`
}

const NO_ACCRUAL_START = 'No accrual start is recorded for this penalty.'

const FINE_RECORDED_BY_OTHERS =
  'A judgment for the town is recorded. Finance or an administrator records the fine here.'

function accrualSentence(exposure: PenaltyExposure): string {
  if (exposure.fromDate !== null) return `${accrualDays(exposure.fromDate, exposure.days)}.`
  return exposure.kind === 'range' && exposure.noAccrualRule === true
    ? NO_ACCRUAL_START
    : ACCRUAL_NOT_STARTED
}

function PenaltyExposureNote({
  exposure,
  hasFines,
}: {
  exposure: PenaltyExposure
  hasFines: boolean
}) {
  if (exposure.kind === 'range') {
    return (
      <div className="record-item">
        <p className="m-0 font-medium">{exposure.label}</p>
        <p className="m-0">{accrualSentence(exposure)}</p>
        {penaltyRangeLines(exposure).map((line) => (
          <p key={line} className="m-0">
            {line}
          </p>
        ))}
      </div>
    )
  }
  return (
    <div className="record-item">
      <p className="m-0 font-medium">
        {hasFines ? PENALTY_EXPOSURE_AFTER_FINE_LABEL : exposure.label}
      </p>
      <p className="m-0">
        {exposure.fromDate === null
          ? ACCRUAL_NOT_STARTED
          : `${accrualDays(exposure.fromDate, exposure.days)}, estimated ${formatCents(exposure.cents)}.`}
      </p>
    </div>
  )
}

export function FinePaymentForm({
  fineId,
  variant,
}: {
  fineId: string
  variant: 'default' | 'outline'
}) {
  return (
    <ActionForm action={finePaymentAction} submitLabel="Record payment" variant={variant}>
      <Hidden name="fineId" value={fineId} />
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
  )
}

export function fineBases(detail: CaseDetail): [string, string][] {
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
  return [...judgments, ...wins]
}

export function fineApplies(detail: CaseDetail): boolean {
  return fineBases(detail).length > 0 && !detail.stay.stayed
}

export function MoneySection({
  detail,
  can,
  hosted = NO_HOSTED,
}: {
  detail: CaseDetail
  can: Can
  hosted?: ReadonlySet<string>
}) {
  const bases = fineBases(detail)
  return (
    <Section id="fines" title="Fines">
      {detail.stay.stayed ? (
        <p className="m-0 font-medium">
          Fines cannot be recorded while the appeal stay is in effect.
        </p>
      ) : null}
      {detail.fines.length === 0 ? <p>No fine has been imposed by a court.</p> : null}
      {detail.fines.map((f) => (
        <article key={f.row.id} className="record-item space-y-2">
          <p className="font-medium">{`${FINE_KIND_LABELS[f.row.kind]}, ${formatCents(f.row.amountCents)}, imposed ${formatCivilDate(f.row.imposedOn)} by ${f.row.court}, docket ${f.row.docket}`}</p>
          <p>{`Paid ${formatCents(f.paidCents)}. Balance due ${formatCents(f.dueCents)}.`}</p>
          <FinePayments
            fineId={f.row.id}
            fineLabel={FINE_KIND_LABELS[f.row.kind]}
            entries={detail.payments?.byFine.get(f.row.id) ?? []}
            canRefund={detail.payments?.canRefund === true}
          />
          {can.collect && f.dueCents > 0 && !hosted.has(`record_fine_payment:${f.row.id}`) ? (
            <details>
              <summary className="cursor-pointer font-medium">Record a payment</summary>
              <FinePaymentForm fineId={f.row.id} variant="outline" />
            </details>
          ) : null}
        </article>
      ))}
      {detail.exposure === null ? null : (
        <PenaltyExposureNote exposure={detail.exposure} hasFines={detail.fines.length > 0} />
      )}
      {!can.fine && bases.length > 0 ? <p className="m-0">{FINE_RECORDED_BY_OTHERS}</p> : null}
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

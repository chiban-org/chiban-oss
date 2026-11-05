import Link from 'next/link'
import { NEW_TAB } from '@/components/newTab'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import type { FeeComputation } from '@/features/fees/computeFees'
import { type FeeRow, feeRows } from '@/features/fees/feeRows'
import type { ApplicationPayments } from '@/features/payments/applicationPayments'
import { entrySummary } from '@/features/payments/entrySummary'
import { formatCents } from '@/lib/money'
import { FeeOverrideForm } from './feePanels'
import { EntryControls, RecordPaymentForm } from './paymentControls'

export function feeRowsOf(view: StaffApplicationView, payments: ApplicationPayments | null) {
  return feeRows(
    view.fees.assessments.map((a) => ({
      id: a.id,
      stage: a.stage,
      computation: a.computation as FeeComputation,
    })),
    payments === null ? null : payments.balance.lines,
    view.fees.preview,
  )
}

function Cents({ cents }: { cents: number | null }) {
  return cents === null ? (
    <span className="text-muted-foreground">Not assessed</span>
  ) : (
    <>{formatCents(cents)}</>
  )
}

function FeeLine({ row, money }: { row: FeeRow; money: boolean }) {
  return (
    <tr className={row.preview ? 'text-ink-secondary' : undefined}>
      <td>
        <span className="font-medium">{row.label}</span>
        {row.stageText === null ? null : (
          <span className="block text-muted-foreground">{row.stageText}</span>
        )}
        {row.explanation.length === 0 ? null : (
          <details>
            <summary className="text-sm font-normal">How it was worked out</summary>
            {row.explanation.map((step) => (
              <p key={step} className="m-0">
                {step}
              </p>
            ))}
          </details>
        )}
      </td>
      <td className="text-right">{row.assessedText}</td>
      {money ? (
        <>
          <td className="text-right">
            <Cents cents={row.paidCents} />
          </td>
          <td className="text-right">
            <Cents cents={row.dueCents} />
          </td>
        </>
      ) : null}
    </tr>
  )
}

function FeeLines({ rows, money }: { rows: FeeRow[]; money: boolean }) {
  if (rows.length === 0) return <p>No fees have been assessed.</p>
  return (
    <table className="text-sm">
      <thead>
        <tr className="text-left">
          <th scope="col">Fee</th>
          <th scope="col" className="text-right">
            Assessed
          </th>
          {money ? (
            <>
              <th scope="col" className="text-right">
                Paid
              </th>
              <th scope="col" className="text-right">
                Due
              </th>
            </>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <FeeLine key={row.key} row={row} money={money} />
        ))}
      </tbody>
    </table>
  )
}

function Ledger({ payments }: { payments: ApplicationPayments }) {
  if (payments.entries.length === 0) return <p>No money has been recorded on this application.</p>
  return (
    <ul className="list-none p-0">
      {payments.entries.map((entry) => (
        <li key={entry.id} className="record-item pb-3">
          <p className="m-0">
            {`${entrySummary(entry)} `}
            {entry.receiptId === null ? null : (
              <Link {...NEW_TAB} href={`/staff/receipts/${entry.receiptId}`}>
                {`Receipt ${entry.receiptNumber ?? ''}`}
              </Link>
            )}
          </p>
          <EntryControls entry={entry} payments={payments} />
        </li>
      ))}
    </ul>
  )
}

function Balance({ payments, rows }: { payments: ApplicationPayments; rows: FeeRow[] }) {
  const { balance } = payments
  return (
    <>
      {rows.some((r) => !r.preview) ? (
        <p className="font-semibold">{`Balance due ${formatCents(balance.dueCents)}.`}</p>
      ) : null}
      {balance.unknownAttempts > 0 ? (
        <p role="alert">A card payment outcome is unknown. See Payments.</p>
      ) : null}
      {balance.pendingAttempts > 0 ? (
        <p>{`${balance.pendingAttempts} card payment waiting on the processor.`}</p>
      ) : null}
    </>
  )
}

export function FeesPaymentsPanel({
  view,
  payments,
  rows,
}: {
  view: StaffApplicationView
  payments: ApplicationPayments | null
  rows: FeeRow[]
}) {
  return (
    <section aria-label="Fees and payments" id="fees-and-payments">
      <h2>Fees and payments</h2>
      <FeeLines rows={rows} money={payments !== null} />
      {payments === null ? null : <Balance payments={payments} rows={rows} />}
      {payments === null ? null : <RecordPaymentForm payments={payments} />}
      <FeeOverrideForm view={view} dueCents={payments?.balance.dueCents ?? null} />
      {payments === null ? null : (
        <>
          <h3>Payments recorded</h3>
          <Ledger payments={payments} />
        </>
      )}
    </section>
  )
}

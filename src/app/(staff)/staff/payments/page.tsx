import Link from 'next/link'
import { StatusChip } from '@/components/StatusChip'
import { entryTypeLabel, methodLabel } from '@/features/payments/labels'
import { loadPaymentsOverview } from '@/features/payments/overview'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'
import { requireStaffContext } from '@/server/requireStaff'

export const dynamic = 'force-dynamic'

export default async function PaymentsPage() {
  const ctx = await requireStaffContext()
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const result = await loadPaymentsOverview(ctx.db, ctx.actor, { date: today }, ctx.signal)
  if (!result.ok) {
    return (
      <main>
        <h1>Payments</h1>
        <p role="alert">You do not have permission to view payments.</p>
      </main>
    )
  }
  const { unknownAttempts, anomalies, overpayments, todaysEntries } = result.value
  return (
    <main>
      <h1>Payments</h1>
      <section aria-label="Outcome unknown">
        <h2>Card payments with an unknown outcome</h2>
        {unknownAttempts.length === 0 ? <p>None.</p> : null}
        <ul className="space-y-2">
          {unknownAttempts.map((a) => (
            <li key={a.id}>
              <StatusChip status="overdue" label="Outcome unknown" />{' '}
              <Link href={`/staff/payments/${a.id}`} className="text-action underline">
                {`${formatCents(a.amountCents)} from ${a.payerName}`}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Anomalies">
        <h2>Anomalies</h2>
        {anomalies.length === 0 ? <p>None.</p> : null}
        <ul className="space-y-2">
          {anomalies.map((a) => (
            <li key={a.id}>
              <StatusChip
                status="failed"
                label={`Anomaly: ${(a.anomaly ?? '').replaceAll('_', ' ')}`}
              />{' '}
              <Link href={`/staff/payments/${a.id}`} className="text-action underline">
                {`${formatCents(a.amountCents)} from ${a.payerName}`}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Overpayments">
        <h2>Overpayment to refund</h2>
        {overpayments.length === 0 ? <p>None.</p> : null}
        <ul className="space-y-2">
          {overpayments.map((o) => (
            <li key={o.applicationId}>
              <StatusChip status="overdue" label="Overpayment to refund" />{' '}
              <Link
                href={`/staff/applications/${o.applicationId}`}
                className="text-action underline"
              >
                {`${o.applicationNumber}: ${formatCents(o.amountCents)}`}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Today">
        <h2>{`Entries for ${formatCivilDate(today)}`}</h2>
        {todaysEntries.length === 0 ? <p>No money has moved today.</p> : null}
        <table className="my-2 w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1">Entry</th>
              <th className="px-3 text-right">Amount</th>
              <th className="px-3">Payer</th>
              <th className="px-3">Application</th>
              <th className="px-3">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {todaysEntries.map((e) => (
              <tr key={e.id} className="border-b">
                <td className="py-1">{`${entryTypeLabel(e.entryType)}, ${methodLabel(e.method).toLowerCase()}`}</td>
                <td className="px-3 text-right">{formatCents(e.amountCents)}</td>
                <td className="px-3">{e.payerName}</td>
                <td className="px-3">{e.applicationNumbers.join(', ')}</td>
                <td className="px-3">
                  {e.receiptId === null ? null : (
                    <Link href={`/staff/receipts/${e.receiptId}`} className="text-action underline">
                      {`Receipt ${e.receiptNumber ?? ''}`}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          <Link href="/staff/reports/cash-receipts" className="text-action underline">
            Daily cash receipts report
          </Link>
        </p>
      </section>
    </main>
  )
}

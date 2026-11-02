import Link from 'next/link'
import { cashReceiptsReport, REPORT_METHODS } from '@/features/reports/cashReceipts'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'
import { requireStaffContext } from '@/server/requireStaff'
import { parseCivilDate } from '@/types/civilDate'

export const dynamic = 'force-dynamic'

const METHOD_HEADINGS = {
  cash: 'Cash',
  check: 'Check',
  card_present: 'Card present',
  card_online: 'Card online',
  simulated: 'Simulated',
} as const

export default async function CashReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  const ctx = await requireStaffContext()
  const parsed = parseCivilDate(date ?? '')
  const day = parsed.ok ? parsed.value : await townToday(ctx.db, new Date(), ctx.signal)
  const result = await cashReceiptsReport(ctx.db, ctx.actor, { date: day }, ctx.signal)
  if (!result.ok) {
    return (
      <main>
        <h1>Daily cash receipts</h1>
        <p role="alert">You do not have permission to view this report.</p>
      </main>
    )
  }
  const report = result.value
  return (
    <main>
      <h1>Daily cash receipts</h1>
      <p>{report.townName}</p>
      <form method="get" className="no-print my-3 flex items-end gap-3">
        <label className="block text-sm font-medium">
          Date
          <input
            type="date"
            name="date"
            defaultValue={day}
            className="mt-1 block rounded-md border px-2 py-1.5"
          />
        </label>
        <button type="submit" className="rounded-md border px-3 py-1.5 text-sm">
          Show day
        </button>
        <Link
          href={`/staff/reports/cash-receipts/csv?date=${day}`}
          className="text-action underline"
        >
          Download CSV
        </Link>
      </form>
      <h2>{formatCivilDate(day)}</h2>
      <table className="my-4 w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Fee</th>
            {REPORT_METHODS.map((m) => (
              <th key={m} className="text-right">
                {METHOD_HEADINGS[m]}
              </th>
            ))}
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => (
            <tr key={row.feeCode} className="border-b">
              <td className="py-2">{row.label}</td>
              {REPORT_METHODS.map((m) => (
                <td key={m} className="text-right">
                  {formatCents(row.byMethod[m])}
                </td>
              ))}
              <td className="text-right">{formatCents(row.totalCents)}</td>
            </tr>
          ))}
          {(
            [
              ['Convenience fee (not town revenue)', report.convenienceFees],
              ['Overpayment to refund (not town revenue)', report.overpayments],
              ['Total', report.totalsByMethod],
            ] as const
          ).map(([label, amounts]) => (
            <tr key={label} className="border-b font-semibold">
              <td className="py-2">{label}</td>
              {REPORT_METHODS.map((m) => (
                <td key={m} className="text-right">
                  {formatCents(amounts[m])}
                </td>
              ))}
              <td className="text-right">
                {formatCents(REPORT_METHODS.reduce((sum, m) => sum + amounts[m], 0))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        {report.entryCount} ledger {report.entryCount === 1 ? 'entry' : 'entries'}. Grand total{' '}
        {formatCents(report.grandTotalCents)}.
      </p>
      <h2>Checks for deposit</h2>
      {report.checks.length === 0 ? (
        <p>No checks received.</p>
      ) : (
        <table className="my-2 w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Check number</th>
              <th>Payer</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {report.checks.map((check) => (
              <tr key={`${check.number}-${check.payerName}`} className="border-b">
                <td className="py-2">{check.number}</td>
                <td>{check.payerName}</td>
                <td className="text-right">{formatCents(check.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}

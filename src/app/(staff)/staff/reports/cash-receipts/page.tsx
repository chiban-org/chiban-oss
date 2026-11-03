import Link from 'next/link'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { firstParam, type RawSearchParams, readTableParams } from '@/features/dataTable/params'
import { cashReceiptsReport, REPORT_METHODS } from '@/features/reports/cashReceipts'
import {
  CASH_RECEIPTS_PATH,
  CHECK_SORT,
  CHECKS_SCOPE,
  FEE_SORT,
  FEES_SCOPE,
  sortChecks,
  sortFeeRows,
} from '@/features/reports/reportSorts'
import { activeSortFields, scopedSort } from '@/features/staffTables/scopedSort'
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
  searchParams: Promise<RawSearchParams>
}) {
  const params = readTableParams(await searchParams)
  const date = firstParam(params, 'date')
  const feeSort = scopedSort(CASH_RECEIPTS_PATH, params, FEE_SORT, FEES_SCOPE)
  const checkSort = scopedSort(CASH_RECEIPTS_PATH, params, CHECK_SORT, CHECKS_SCOPE)
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
        {activeSortFields(params, [FEES_SCOPE, CHECKS_SCOPE]).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
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
      <div className="table-panel my-4">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr>
              <SortHeader label="Fee" link={feeSort.links.fee} />
              {REPORT_METHODS.map((m) => (
                <SortHeader
                  key={m}
                  label={METHOD_HEADINGS[m]}
                  link={feeSort.links[m]}
                  className="text-right"
                />
              ))}
              <SortHeader label="Total" link={feeSort.links.total} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {sortFeeRows(report.rows, feeSort.state).map((row) => (
              <tr key={row.feeCode}>
                <td>{row.label}</td>
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
              <tr key={label} className="font-semibold">
                <td>{label}</td>
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
      </div>
      <p>
        {report.entryCount} ledger {report.entryCount === 1 ? 'entry' : 'entries'}. Grand total{' '}
        {formatCents(report.grandTotalCents)}.
      </p>
      <h2>Checks for deposit</h2>
      {report.checks.length === 0 ? (
        <p>No checks received.</p>
      ) : (
        <div className="table-panel my-2">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <SortHeader label="Check number" link={checkSort.links.number} />
                <SortHeader label="Payer" link={checkSort.links.payer} />
                <SortHeader label="Amount" link={checkSort.links.amount} className="text-right" />
              </tr>
            </thead>
            <tbody>
              {sortChecks(report.checks, checkSort.state).map((check) => (
                <tr key={`${check.number}-${check.payerName}`}>
                  <td>{check.number}</td>
                  <td>{check.payerName}</td>
                  <td className="text-right">{formatCents(check.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

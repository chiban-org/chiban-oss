import type { Metadata } from 'next'
import Link from 'next/link'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { Button } from '@/components/ui/button'
import { firstParam, type RawSearchParams, readTableParams } from '@/features/dataTable/params'
import {
  type CashReceiptsReport,
  cashReceiptsReport,
  REPORT_METHODS,
} from '@/features/reports/cashReceipts'
import {
  CASH_RECEIPTS_PATH,
  CHECK_SORT,
  CHECKS_SCOPE,
  type CheckSortKey,
  FEE_SORT,
  FEES_SCOPE,
  type FeeSortKey,
  sortChecks,
  sortFeeRows,
} from '@/features/reports/reportSorts'
import { activeSortFields, type ScopedSort, scopedSort } from '@/features/staffTables/scopedSort'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'
import { requireStaffContext } from '@/server/requireStaff'
import { parseCivilDate } from '@/types/civilDate'

export const metadata: Metadata = { title: 'Daily cash receipts' }

export const dynamic = 'force-dynamic'

const METHOD_HEADINGS = {
  cash: 'Cash',
  check: 'Check',
  card_present: 'Card present',
  card_online: 'Card online',
  simulated: 'Simulated',
} as const

function FeeTable({ report, sort }: { report: CashReceiptsReport; sort: ScopedSort<FeeSortKey> }) {
  return (
    <>
      <p className="text-muted-foreground">
        Fees in alphabetical order. Click a column heading to sort.
      </p>
      <div className="table-panel">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr>
              <SortHeader label="Fee" link={sort.links.fee} />
              {REPORT_METHODS.map((m) => (
                <SortHeader
                  key={m}
                  label={METHOD_HEADINGS[m]}
                  link={sort.links[m]}
                  className="text-right"
                />
              ))}
              <SortHeader label="Total" link={sort.links.total} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {sortFeeRows(report.rows, sort.state).map((row) => (
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
    </>
  )
}

function CheckTable({
  checks,
  sort,
}: {
  checks: CashReceiptsReport['checks']
  sort: ScopedSort<CheckSortKey>
}) {
  if (checks.length === 0) return <p>No checks received.</p>
  return (
    <>
      <p className="text-muted-foreground">
        Checks in the order they were taken. Click a column heading to sort.
      </p>
      <div className="table-panel">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <SortHeader label="Check number" link={sort.links.number} />
              <SortHeader label="Payer" link={sort.links.payer} />
              <SortHeader label="Amount" link={sort.links.amount} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {sortChecks(checks, sort.state).map((check) => (
              <tr key={`${check.number}-${check.payerName}-${check.amountCents}`}>
                <td>{check.number}</td>
                <td>
                  {check.payerName}
                  {check.returnedOn === null ? null : (
                    <span className="block text-muted-foreground">
                      {`Returned, recorded ${formatCivilDate(check.returnedOn)}`}
                    </span>
                  )}
                </td>
                <td className="text-right">{formatCents(check.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

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
    return <NoPermission title="Daily cash receipts" action="view this report" />
  }
  const report = result.value
  return (
    <main data-wide="">
      <h1>Daily cash receipts</h1>
      <p>{report.townName}</p>
      <form method="get" className="toolbar no-print flex flex-wrap items-end gap-3">
        <TextField label="Date" name="date" type="date" defaultValue={day} />
        {activeSortFields(params, [FEES_SCOPE, CHECKS_SCOPE]).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <Button type="submit" variant="outline">
          Show day
        </Button>
      </form>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2>{formatCivilDate(day)}</h2>
        {report.entryCount === 0 ? null : (
          <span className="no-print flex gap-x-6">
            <Link href={`/staff/reports/cash-receipts/csv?date=${day}`}>Download CSV</Link>
            <Link href={`/staff/reports/cash-receipts/xlsx?date=${day}`}>Download Excel</Link>
          </span>
        )}
      </div>
      {report.entryCount === 0 ? (
        <p>No money was received on this day. Choose another date above.</p>
      ) : (
        <>
          <FeeTable report={report} sort={feeSort} />
          <h2 className="mt-8">Checks for deposit</h2>
          <CheckTable checks={report.checks} sort={checkSort} />
        </>
      )}
    </main>
  )
}

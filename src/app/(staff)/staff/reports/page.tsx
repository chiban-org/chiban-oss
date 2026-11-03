import Link from 'next/link'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { readTableParams } from '@/features/dataTable/params'
import { permitVolumeReport } from '@/features/reports/permitVolume'
import { processingTimeReport } from '@/features/reports/processingTime'
import { resolveRange } from '@/features/reports/rangeInput'
import {
  PROCESSING_SCOPE,
  PROCESSING_SORT,
  REPORTS_PATH,
  REVENUE_SCOPE,
  REVENUE_SORT,
  sortProcessing,
  sortRevenue,
  sortVolume,
  VOLUME_SCOPE,
  VOLUME_SORT,
} from '@/features/reports/reportSorts'
import { revenueReport } from '@/features/reports/revenue'
import { applicationTypeLabels } from '@/features/reports/typeLabels'
import { activeSortFields, scopedSort } from '@/features/staffTables/scopedSort'
import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'
import { requireStaffContext } from '@/server/requireStaff'

export const dynamic = 'force-dynamic'

const MONTH_LABEL = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'long',
})

function monthLabel(month: string): string {
  return MONTH_LABEL.format(new Date(`${month}-01T00:00:00Z`))
}

const days = (n: number | null): string => (n === null ? '' : n.toFixed(1))

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const raw = await searchParams
  const params = readTableParams(raw)
  const volumeSort = scopedSort(REPORTS_PATH, params, VOLUME_SORT, VOLUME_SCOPE)
  const processingSort = scopedSort(REPORTS_PATH, params, PROCESSING_SORT, PROCESSING_SCOPE)
  const revenueSort = scopedSort(REPORTS_PATH, params, REVENUE_SORT, REVENUE_SCOPE)
  const ctx = await requireStaffContext()
  const range = await resolveRange(ctx.db, raw, ctx.signal)
  const [volume, processing, revenue] = await Promise.all([
    permitVolumeReport(ctx.db, ctx.actor, range, ctx.signal),
    processingTimeReport(ctx.db, ctx.actor, range, ctx.signal),
    revenueReport(ctx.db, ctx.actor, range, ctx.signal),
  ])
  if (!volume.ok && volume.error === 'forbidden') {
    return (
      <main data-wide="">
        <h1>Reports</h1>
        <p role="alert">You do not have permission to view reports.</p>
      </main>
    )
  }
  const typeLabels = await applicationTypeLabels(
    ctx.db,
    [
      ...(volume.ok ? volume.value.map((r) => r.type) : []),
      ...(processing.ok ? processing.value.map((r) => r.type) : []),
    ],
    ctx.signal,
  )
  const query = `from=${range.from}&to=${range.to}`
  const typeLabel = (type: string) => typeLabels.get(type) ?? type
  return (
    <main data-wide="">
      <h1>Reports</h1>
      <form method="get" className="no-print my-3 flex flex-wrap items-end gap-3">
        <label className="block text-sm font-medium">
          From
          <input
            type="date"
            name="from"
            defaultValue={range.from}
            className="mt-1 block rounded-md border px-2 py-1.5"
          />
        </label>
        <label className="block text-sm font-medium">
          To
          <input
            type="date"
            name="to"
            defaultValue={range.to}
            className="mt-1 block rounded-md border px-2 py-1.5"
          />
        </label>
        {activeSortFields(params, [VOLUME_SCOPE, PROCESSING_SCOPE, REVENUE_SCOPE]).map(
          ([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ),
        )}
        <button type="submit" className="rounded-md border px-3 py-1.5 text-sm">
          Show range
        </button>
      </form>
      <p>
        {formatCivilDate(range.from)} to {formatCivilDate(range.to)}
      </p>
      {!volume.ok ? (
        <p role="alert">Choose a range of at most five years.</p>
      ) : (
        <>
          <h2>Permit volume</h2>
          <p>
            <Link
              className="text-action underline"
              href={`/staff/reports/permit-volume/csv?${query}`}
            >
              Download CSV
            </Link>
          </p>
          <div className="table-panel my-2">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr>
                  <SortHeader label="Month" link={volumeSort.links.month} />
                  <SortHeader label="Type" link={volumeSort.links.type} />
                  <SortHeader
                    label="Received"
                    link={volumeSort.links.received}
                    className="text-right"
                  />
                  <SortHeader
                    label="Issued"
                    link={volumeSort.links.issued}
                    className="text-right"
                  />
                  <SortHeader
                    label="Closed"
                    link={volumeSort.links.closed}
                    className="text-right"
                  />
                  <SortHeader
                    label="Denied"
                    link={volumeSort.links.denied}
                    className="text-right"
                  />
                  <SortHeader
                    label="Withdrawn"
                    link={volumeSort.links.withdrawn}
                    className="text-right"
                  />
                </tr>
              </thead>
              <tbody>
                {sortVolume(volume.value, volumeSort.state, typeLabel).map((r) => (
                  <tr key={`${r.month}-${r.type}`}>
                    <td>{monthLabel(r.month)}</td>
                    <td>{typeLabel(r.type)}</td>
                    <td className="text-right">{r.received}</td>
                    <td className="text-right">{r.issued}</td>
                    <td className="text-right">{r.closed}</td>
                    <td className="text-right">{r.denied}</td>
                    <td className="text-right">{r.withdrawn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {processing.ok ? (
        <>
          <h2>Processing time</h2>
          <p>
            <Link
              className="text-action underline"
              href={`/staff/reports/processing-time/csv?${query}`}
            >
              Download CSV
            </Link>
          </p>
          <div className="table-panel my-2">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr>
                  <SortHeader label="Type" link={processingSort.links.type} />
                  <SortHeader
                    label="Issued"
                    link={processingSort.links.issued}
                    className="text-right"
                  />
                  <SortHeader
                    label="Median days to issue"
                    link={processingSort.links.median}
                    className="text-right"
                  />
                  <SortHeader
                    label="90th percentile days"
                    link={processingSort.links.p90}
                    className="text-right"
                  />
                  <SortHeader
                    label="Median days to decision"
                    link={processingSort.links.decision}
                    className="text-right"
                  />
                  <SortHeader
                    label="Decided on time"
                    link={processingSort.links.onTime}
                    className="text-right"
                  />
                  <SortHeader
                    label="Decided late"
                    link={processingSort.links.late}
                    className="text-right"
                  />
                </tr>
              </thead>
              <tbody>
                {sortProcessing(processing.value, processingSort.state, typeLabel).map((r) => (
                  <tr key={r.type}>
                    <td>{typeLabel(r.type)}</td>
                    <td className="text-right">{r.issued}</td>
                    <td className="text-right">{days(r.medianReceivedToIssued)}</td>
                    <td className="text-right">{days(r.p90ReceivedToIssued)}</td>
                    <td className="text-right">{days(r.medianCompleteToDecision)}</td>
                    <td className="text-right">{r.decidedOnTime ?? ''}</td>
                    <td className="text-right">{r.decidedLate ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      {revenue.ok ? (
        <>
          <h2>Revenue</h2>
          <p>
            <Link className="text-action underline" href={`/staff/reports/revenue/csv?${query}`}>
              Download CSV
            </Link>
          </p>
          <div className="table-panel my-2">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <SortHeader label="Month" link={revenueSort.links.month} />
                  <SortHeader label="Fee" link={revenueSort.links.fee} />
                  <SortHeader label="Net" link={revenueSort.links.net} className="text-right" />
                </tr>
              </thead>
              <tbody>
                {sortRevenue(revenue.value, revenueSort.state).map((r) => (
                  <tr key={`${r.month}-${r.kind}-${r.code}`}>
                    <td>{monthLabel(r.month)}</td>
                    <td>{r.label}</td>
                    <td className="text-right">{formatCents(r.netCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      <h2>Daily cash receipts</h2>
      <p>
        <Link className="text-action underline" href="/staff/reports/cash-receipts">
          Open the daily cash receipts report
        </Link>
      </p>
      <h2>Census building permits</h2>
      <p>
        <Link className="text-action underline" href="/staff/reports/census">
          Open the Census building permits report
        </Link>
      </p>
    </main>
  )
}

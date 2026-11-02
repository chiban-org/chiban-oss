import Link from 'next/link'
import { permitVolumeReport } from '@/features/reports/permitVolume'
import { processingTimeReport } from '@/features/reports/processingTime'
import { resolveRange } from '@/features/reports/rangeInput'
import { revenueReport } from '@/features/reports/revenue'
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
  const ctx = await requireStaffContext()
  const range = await resolveRange(ctx.db, await searchParams, ctx.signal)
  const [volume, processing, revenue] = await Promise.all([
    permitVolumeReport(ctx.db, ctx.actor, range, ctx.signal),
    processingTimeReport(ctx.db, ctx.actor, range, ctx.signal),
    revenueReport(ctx.db, ctx.actor, range, ctx.signal),
  ])
  if (!volume.ok && volume.error === 'forbidden') {
    return (
      <main>
        <h1>Reports</h1>
        <p role="alert">You do not have permission to view reports.</p>
      </main>
    )
  }
  const query = `from=${range.from}&to=${range.to}`
  return (
    <main>
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
          <table className="my-2 w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Month</th>
                <th>Type</th>
                <th className="text-right">Received</th>
                <th className="text-right">Issued</th>
                <th className="text-right">Closed</th>
                <th className="text-right">Denied</th>
                <th className="text-right">Withdrawn</th>
              </tr>
            </thead>
            <tbody>
              {volume.value.map((r) => (
                <tr key={`${r.month}-${r.type}`} className="border-b">
                  <td className="py-2">{monthLabel(r.month)}</td>
                  <td>{r.type}</td>
                  <td className="text-right">{r.received}</td>
                  <td className="text-right">{r.issued}</td>
                  <td className="text-right">{r.closed}</td>
                  <td className="text-right">{r.denied}</td>
                  <td className="text-right">{r.withdrawn}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
          <table className="my-2 w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Type</th>
                <th className="text-right">Issued</th>
                <th className="text-right">Median days to issue</th>
                <th className="text-right">90th percentile days</th>
                <th className="text-right">Median days to decision</th>
                <th className="text-right">Decided on time</th>
                <th className="text-right">Decided late</th>
              </tr>
            </thead>
            <tbody>
              {processing.value.map((r) => (
                <tr key={r.type} className="border-b">
                  <td className="py-2">{r.type}</td>
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
          <table className="my-2 w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Month</th>
                <th>Fee</th>
                <th className="text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {revenue.value.map((r) => (
                <tr key={`${r.month}-${r.kind}-${r.code}`} className="border-b">
                  <td className="py-2">{monthLabel(r.month)}</td>
                  <td>{r.label}</td>
                  <td className="text-right">{formatCents(r.netCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      <h2>Daily cash receipts</h2>
      <p>
        <Link className="text-action underline" href="/staff/reports/cash-receipts">
          Open the daily cash receipts report
        </Link>
      </p>
    </main>
  )
}

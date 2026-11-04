import Link from 'next/link'
import { TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { Button } from '@/components/ui/button'
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
  VOLUME_SCOPE,
  VOLUME_SORT,
} from '@/features/reports/reportSorts'
import { revenueReport } from '@/features/reports/revenue'
import { applicationTypeLabels } from '@/features/reports/typeLabels'
import { activeSortFields, scopedSort } from '@/features/staffTables/scopedSort'
import { formatCivilDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { ProcessingTable, ReportSection, RevenueTable, VolumeTable } from './ReportTables'

export const dynamic = 'force-dynamic'

const OTHER_REPORTS = [
  { href: '/staff/reports/cash-receipts', label: 'Daily cash receipts' },
  { href: '/staff/reports/census', label: 'Census building permits' },
] as const

function OtherReports() {
  return (
    <nav aria-label="Other reports" className="no-print my-4">
      <h2 className="font-sans text-sm font-semibold text-muted-foreground">Other reports</h2>
      <ul className="flex flex-wrap gap-x-6 gap-y-1">
        {OTHER_REPORTS.map((report) => (
          <li key={report.href}>
            <Link className="text-action underline" href={report.href}>
              {report.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

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
    return <NoPermission title="Reports" action="view reports" />
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
      <OtherReports />
      <form method="get" className="toolbar no-print my-4 flex flex-wrap items-end gap-3">
        <TextField label="From" name="from" type="date" defaultValue={range.from} />
        <TextField label="To" name="to" type="date" defaultValue={range.to} />
        {activeSortFields(params, [VOLUME_SCOPE, PROCESSING_SCOPE, REVENUE_SCOPE]).map(
          ([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ),
        )}
        <Button type="submit" variant="outline">
          Show range
        </Button>
      </form>
      <p>
        {formatCivilDate(range.from)} to {formatCivilDate(range.to)}
      </p>
      {!volume.ok ? (
        <p role="alert">Choose a range of at most five years.</p>
      ) : (
        <ReportSection
          title="Permit volume"
          csvHref={`/staff/reports/permit-volume/csv?${query}`}
          order="Oldest month first, then by permit type."
        >
          <VolumeTable rows={volume.value} sort={volumeSort} typeLabel={typeLabel} />
        </ReportSection>
      )}
      {processing.ok ? (
        <ReportSection
          title="Processing time"
          csvHref={`/staff/reports/processing-time/csv?${query}`}
          order="By permit type."
        >
          <ProcessingTable rows={processing.value} sort={processingSort} typeLabel={typeLabel} />
        </ReportSection>
      ) : null}
      {revenue.ok ? (
        <ReportSection
          title="Revenue"
          csvHref={`/staff/reports/revenue/csv?${query}`}
          order="Oldest month first."
        >
          <RevenueTable rows={revenue.value} sort={revenueSort} />
        </ReportSection>
      ) : null}
    </main>
  )
}

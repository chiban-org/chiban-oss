import Link from 'next/link'
import type { ReactNode } from 'react'
import { SortHeader } from '@/components/dataTable/SortHeader'
import type { PermitVolumeRow } from '@/features/reports/permitVolume'
import type { ProcessingTimeRow } from '@/features/reports/processingTime'
import {
  type ProcessingSortKey,
  type RevenueSortKey,
  sortProcessing,
  sortRevenue,
  sortVolume,
  type VolumeSortKey,
} from '@/features/reports/reportSorts'
import type { RevenueRow } from '@/features/reports/revenue'
import type { ScopedSort } from '@/features/staffTables/scopedSort'
import { formatCents } from '@/lib/money'

const MONTH_LABEL = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'long',
})

function monthLabel(month: string): string {
  return MONTH_LABEL.format(new Date(`${month}-01T00:00:00Z`))
}

const days = (n: number | null): string => (n === null ? '' : n.toFixed(1))

export function ReportSection({
  title,
  csvHref,
  order,
  children,
}: {
  title: string
  csvHref: string
  order: string
  children: ReactNode
}) {
  return (
    <section aria-label={title} data-plain className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2>{title}</h2>
        <Link className="no-print" href={csvHref}>
          Download CSV
        </Link>
      </div>
      <p className="text-muted-foreground">{`${order} Click a column heading to sort.`}</p>
      {children}
    </section>
  )
}

export function VolumeTable({
  rows,
  sort,
  typeLabel,
}: {
  rows: readonly PermitVolumeRow[]
  sort: ScopedSort<VolumeSortKey>
  typeLabel: (type: string) => string
}) {
  return (
    <div className="table-panel">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr>
            <SortHeader label="Month" link={sort.links.month} />
            <SortHeader label="Type" link={sort.links.type} />
            <SortHeader label="Received" link={sort.links.received} className="text-right" />
            <SortHeader label="Issued" link={sort.links.issued} className="text-right" />
            <SortHeader label="Closed" link={sort.links.closed} className="text-right" />
            <SortHeader label="Denied" link={sort.links.denied} className="text-right" />
            <SortHeader label="Withdrawn" link={sort.links.withdrawn} className="text-right" />
          </tr>
        </thead>
        <tbody>
          {sortVolume(rows, sort.state, typeLabel).map((r) => (
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
  )
}

export function ProcessingTable({
  rows,
  sort,
  typeLabel,
}: {
  rows: readonly ProcessingTimeRow[]
  sort: ScopedSort<ProcessingSortKey>
  typeLabel: (type: string) => string
}) {
  return (
    <div className="table-panel">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr>
            <SortHeader label="Type" link={sort.links.type} />
            <SortHeader label="Issued" link={sort.links.issued} className="text-right" />
            <SortHeader
              label="Median days to issue"
              link={sort.links.median}
              className="text-right"
            />
            <SortHeader label="90th percentile days" link={sort.links.p90} className="text-right" />
            <SortHeader
              label="Median days to decision"
              link={sort.links.decision}
              className="text-right"
            />
            <SortHeader label="Decided on time" link={sort.links.onTime} className="text-right" />
            <SortHeader label="Decided late" link={sort.links.late} className="text-right" />
          </tr>
        </thead>
        <tbody>
          {sortProcessing(rows, sort.state, typeLabel).map((r) => (
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
  )
}

export function RevenueTable({
  rows,
  sort,
}: {
  rows: readonly RevenueRow[]
  sort: ScopedSort<RevenueSortKey>
}) {
  return (
    <div className="table-panel">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <SortHeader label="Month" link={sort.links.month} />
            <SortHeader label="Fee" link={sort.links.fee} />
            <SortHeader label="Net" link={sort.links.net} className="text-right" />
          </tr>
        </thead>
        <tbody>
          {sortRevenue(rows, sort.state).map((r) => (
            <tr key={`${r.month}-${r.kind}-${r.code}`}>
              <td>{monthLabel(r.month)}</td>
              <td>{r.label}</td>
              <td className="text-right">{formatCents(r.netCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

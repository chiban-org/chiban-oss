import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { listOwedResults, type OwedResultRow } from '@/features/inspections/owedResults'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'

export const metadata: Metadata = { title: 'Results owed' }

export const dynamic = 'force-dynamic'

const LEAD =
  'Scheduled inspections dated before today that have no result yet, across all inspectors, oldest first.'

function lateText(days: number): string {
  return days === 1 ? '1 day late' : `${days} days late`
}

function OwedRow({ row }: { row: OwedResultRow }) {
  return (
    <li className="record-item">
      <p className="m-0 font-semibold">
        <Link href={`/staff/applications/${row.applicationId}`}>{row.applicationNumber}</Link>
        {`, ${row.typeLabel}`}
      </p>
      <p className="m-0 text-muted-foreground">
        {`${row.inspectorName ?? 'No inspector'}, was ${formatCivilDate(row.scheduledDate)}, ${lateText(row.daysLate)}`}
      </p>
      <Link
        href={`/staff/inspections/${row.inspectionId}`}
        className="inline-flex min-h-11 items-center font-semibold"
      >
        Record result
        <span className="sr-only">{` for ${row.applicationNumber}, ${row.typeLabel}`}</span>
      </Link>
    </li>
  )
}

export default async function OwedResultsPage() {
  const ctx = await requireStaffContext()
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const owed = await listOwedResults(ctx.db, ctx.actor, today, ctx.signal)
  if (!owed.ok) return <NoPermission title="Results owed" action="see results owed" />
  return (
    <main>
      <PageHeader
        kicker={<Link href="/staff/inspections">Inspections</Link>}
        title="Results owed"
        lead={LEAD}
      />
      <section aria-labelledby="owed-heading">
        <h2 id="owed-heading">Inspections with no result</h2>
        {owed.value.length === 0 ? (
          <p>No results are owed.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {owed.value.map((row) => (
              <OwedRow key={row.inspectionId} row={row} />
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

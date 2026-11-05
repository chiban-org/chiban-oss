import Link from 'next/link'
import type { MissingResultRow } from '@/features/inspections/inspectorWork'
import { formatCivilDate } from '@/lib/formatDate'

const LINK = 'inline-flex min-h-11 items-center font-semibold'

export function MissingResults({ rows, total }: { rows: MissingResultRow[]; total: number }) {
  if (total === 0) return null
  const more = total - rows.length
  return (
    <section id="missing-results" aria-labelledby="missing-results-heading" className="space-y-2">
      <h2 id="missing-results-heading" className="m-0 text-xl">
        Still need a result
      </h2>
      <p className="m-0">These inspection dates have passed with no result recorded.</p>
      <ul className="m-0 list-none p-0">
        {rows.map((row) => (
          <li key={row.inspectionId} className="record-item">
            <Link href={`/staff/inspections/${row.inspectionId}`} className={LINK}>
              {`${row.applicationNumber}, ${row.typeLabel}`}
            </Link>
            <p className="m-0 text-muted-foreground">{formatCivilDate(row.scheduledDate)}</p>
          </li>
        ))}
      </ul>
      {more > 0 ? <p className="m-0">{`${more} more not shown.`}</p> : null}
    </section>
  )
}

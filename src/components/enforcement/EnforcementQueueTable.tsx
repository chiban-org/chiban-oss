import Link from 'next/link'
import { SortBar, SortHeader } from '@/components/dataTable/SortHeader'
import { STACKED_CELL } from '@/components/queue/QueueCells'
import { StatusChip } from '@/components/StatusChip'
import type { SortLink } from '@/features/dataTable/sort'
import type { CaseSortKey } from '@/features/enforcement/caseListParams'
import type { QueueRow } from '@/features/enforcement/caseQueue'
import { formatCivilDate } from '@/lib/formatDate'

const ROW_CLASS =
  'max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3 max-md:gap-y-2 max-md:px-4 max-md:py-3'

function sortOptions(links: Record<CaseSortKey, SortLink>) {
  return [
    { label: 'Case', link: links.number },
    { label: 'Where', link: links.where },
    { label: 'Status', link: links.status },
    { label: 'Opened', link: links.opened },
    { label: 'Next date', link: links.next },
    { label: 'Appeal stay', link: links.stay },
    { label: 'Assigned to', link: links.assigned },
  ]
}

function NextDate({ row }: { row: QueueRow }) {
  if (row.nextDue === null) return <span className="text-muted-foreground">None running</span>
  return (
    <span
      className={row.nextDue.label === 'Answer overdue' ? 'attention font-semibold' : undefined}
    >
      {`${row.nextDue.label} ${formatCivilDate(row.nextDue.date)}`}
    </span>
  )
}

export function EnforcementQueueTable({
  rows,
  links,
}: {
  rows: QueueRow[]
  links: Record<CaseSortKey, SortLink>
}) {
  if (rows.length === 0) return <p className="px-5 py-8">No cases match.</p>
  return (
    <>
      <SortBar className="mb-3 md:hidden" options={sortOptions(links)} />
      <div className="table-panel">
        <table className="w-full text-left max-md:block">
          <thead className="max-md:hidden">
            <tr>
              <SortHeader label="Case" link={links.number} />
              <SortHeader label="Where" link={links.where} />
              <SortHeader label="Status" link={links.status} />
              <SortHeader label="Opened" link={links.opened} />
              <SortHeader label="Next date" link={links.next} />
              <SortHeader label="Appeal stay" link={links.stay} />
              <SortHeader label="Assigned to" link={links.assigned} />
            </tr>
          </thead>
          <tbody className="max-md:block">
            {rows.map((row) => (
              <tr key={row.caseId} className={ROW_CLASS}>
                <td data-label="Case" className="max-md:block max-md:p-0">
                  <Link
                    href={`/staff/enforcement/${row.caseId}`}
                    className="font-semibold whitespace-nowrap"
                  >
                    {row.number}
                  </Link>
                </td>
                <td
                  data-label="Status"
                  className="max-md:block max-md:max-w-44 max-md:justify-self-end max-md:p-0"
                >
                  <StatusChip status={row.statusChip} label={row.statusLabel} />
                </td>
                <td data-label="Where" className={STACKED_CELL}>
                  {row.locationText}
                </td>
                <td data-label="Opened" className={STACKED_CELL}>
                  {formatCivilDate(row.openedOn)}
                </td>
                <td data-label="Next date" className={STACKED_CELL}>
                  <NextDate row={row} />
                </td>
                <td data-label="Appeal stay" className={STACKED_CELL}>
                  {row.stay.stayed ? (
                    <StatusChip status="overdue" label="Stayed" />
                  ) : (
                    <span>Not stayed</span>
                  )}
                </td>
                <td data-label="Assigned to" className={STACKED_CELL}>
                  {row.assignedToName ?? <span className="text-muted-foreground">Unassigned</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

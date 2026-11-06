import Link from 'next/link'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { StatusChip } from '@/components/StatusChip'
import type { SortLink } from '@/features/dataTable/sort'
import type { CaseSortKey } from '@/features/enforcement/caseListParams'
import type { QueueRow } from '@/features/enforcement/caseQueue'
import { formatCivilDate } from '@/lib/formatDate'

export function EnforcementQueueTable({
  rows,
  links,
}: {
  rows: QueueRow[]
  links: Record<CaseSortKey, SortLink>
}) {
  if (rows.length === 0) return <p className="px-5 py-8">No cases match.</p>
  return (
    <table className="w-full min-w-[52rem] text-left">
      <thead>
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
      <tbody>
        {rows.map((row) => (
          <tr key={row.caseId}>
            <td>
              <Link href={`/staff/enforcement/${row.caseId}`}>{row.number}</Link>
            </td>
            <td>{row.locationText}</td>
            <td>
              <StatusChip status={row.statusChip} label={row.statusLabel} />
            </td>
            <td>{formatCivilDate(row.openedOn)}</td>
            <td>
              {row.nextDue === null ? (
                <span className="text-muted-foreground">None running</span>
              ) : (
                <span
                  className={
                    row.nextDue.label === 'Answer overdue' ? 'attention font-semibold' : undefined
                  }
                >
                  {`${row.nextDue.label} ${formatCivilDate(row.nextDue.date)}`}
                </span>
              )}
            </td>
            <td>
              {row.stay.stayed ? (
                <StatusChip status="overdue" label="Stayed" />
              ) : (
                <span>Not stayed</span>
              )}
            </td>
            <td>
              {row.assignedToName ?? <span className="text-muted-foreground">Unassigned</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

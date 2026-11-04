import Link from 'next/link'
import type { ReactNode } from 'react'
import { SortBar, SortHeader } from '@/components/dataTable/SortHeader'
import { StatusChip } from '@/components/StatusChip'
import type { SortLink } from '@/features/dataTable/sort'
import type { Status } from '@/features/design/tokens'
import type { ReviewListRow, ReviewSortKey } from '@/features/reviews/reviewList'
import { reviewStatusLabel } from '@/features/reviews/statusLabels'
import { formatCivilDateShort } from '@/lib/formatDate'

const COLUMNS: readonly [ReviewSortKey, string][] = [
  ['number', 'Application'],
  ['project', 'Project'],
  ['status', 'Status'],
  ['due', 'Comments due'],
]

function chipStatus(status: string): Status {
  return status === 'signed_off' ? 'passed' : 'neutral'
}

function DueCell({ due }: { due: string | null }) {
  if (due === null) return <span className="text-muted-foreground">No date set</span>
  return <span className="tabular-nums">{formatCivilDateShort(due)}</span>
}

export function ReviewSortBar({ links }: { links: Record<ReviewSortKey, SortLink> }) {
  return (
    <SortBar
      className="sm:hidden"
      options={COLUMNS.map(([key, label]) => ({ label, link: links[key] }))}
    />
  )
}

export function ReviewTable({
  rows,
  links,
  empty,
}: {
  rows: ReviewListRow[]
  links: Record<ReviewSortKey, SortLink>
  empty: ReactNode
}) {
  if (rows.length === 0) return <div className="table-panel">{empty}</div>
  return (
    <div className="table-panel">
      <table className="w-full text-left">
        <thead>
          <tr>
            {COLUMNS.map(([key, label]) => (
              <SortHeader key={key} label={label} link={links[key]} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.assignmentId}>
              <td className="whitespace-nowrap">
                <Link href={`/staff/reviews/${row.assignmentId}`}>{row.number}</Link>
              </td>
              <td>{row.projectTitle}</td>
              <td>
                <StatusChip status={chipStatus(row.status)} label={reviewStatusLabel(row.status)} />
              </td>
              <td className="whitespace-nowrap">
                <DueCell due={row.commentDue} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

import Link from 'next/link'
import { LINK } from '@/components/board/NewTabLink'
import { StatusChip } from '@/components/StatusChip'
import type { MemberBoardAssignmentRow } from '@/features/reviews/boardAssignmentView'
import { byNeed, memberRequestChip } from '@/features/reviews/memberRequestStatus'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

function requestLine(row: MemberBoardAssignmentRow): string {
  return row.commentBy === null
    ? `${row.boardShortName}.`
    : `${row.boardShortName}. Comments by ${formatCivilDate(row.commentBy)}.`
}

export function CommentRequests({
  rows,
  today,
}: {
  rows: MemberBoardAssignmentRow[]
  today: CivilDate
}) {
  if (rows.length === 0) return null
  return (
    <section aria-label="Sent to your board for comment">
      <h2>Sent to your board for comment</h2>
      <ul className="list-none space-y-3 p-0">
        {byNeed(rows).map((row) => {
          const chip = memberRequestChip(row, today)
          return (
            <li key={row.assignmentId} className="record-item">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <p className="m-0 font-semibold">
                  <Link href={`/board/comments/${row.assignmentId}`} className={LINK}>
                    {`Application ${row.number}, ${row.projectTitle}`}
                  </Link>
                </p>
                <StatusChip status={chip.status} label={chip.label} />
              </div>
              <p className="mt-1 mb-0 text-muted-foreground">{requestLine(row)}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

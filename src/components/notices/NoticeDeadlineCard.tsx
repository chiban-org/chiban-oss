import Link from 'next/link'
import { StatusChip } from '@/components/StatusChip'
import { isNoticeLate, type NoticeDeadline } from '@/features/hearings/noticeDeadlines'
import { formatCivilDate } from '@/lib/formatDate'

function days(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`
}

function chip(deadline: NoticeDeadline) {
  return isNoticeLate(deadline) ? (
    <StatusChip status="overdue" label={`Overdue by ${days(-deadline.daysRemaining)}`} />
  ) : (
    <StatusChip status="neutral" label={`${days(deadline.daysRemaining)} remaining`} />
  )
}

function noticeHeading(deadline: NoticeDeadline): string {
  return `Notice for the hearing on ${formatCivilDate(deadline.meetingOn)}`
}

export function NoticeDeadlineCard({ deadline }: { deadline: NoticeDeadline }) {
  const items =
    deadline.missing === 1 ? '1 notice item has' : `${deadline.missing} notice items have`
  return (
    <div className="record-item" role="group" aria-label={noticeHeading(deadline)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="m-0 text-base font-semibold">{noticeHeading(deadline)}</h3>
        {chip(deadline)}
      </div>
      <p className="m-0 mt-1 text-sm">
        {`Due ${formatCivilDate(deadline.dueOn)}. ${items} no proof recorded. `}
        <Link href={`/staff/boards/hearings/${deadline.hearingId}`}>Open the hearing</Link>
      </p>
    </div>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { Marker } from '@/components/board/PacketItems'
import { isBoardMember } from '@/features/access/predicates'
import { markerText, meetingTitle, splitMemberMeetings } from '@/features/boards/memberMeetingSplit'
import { listMemberMeetings, type MemberMeetingRow } from '@/features/boards/memberPackets'
import {
  listMemberBoardAssignments,
  type MemberBoardAssignmentRow,
} from '@/features/reviews/boardAssignmentView'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { requirePortalContext } from '@/server/requirePortal'
import type { CivilDate } from '@/types/civilDate'

export const metadata: Metadata = { title: 'Board meetings' }

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const LINK = 'tap-target inline-flex items-center'

function RowAction({ row }: { row: MemberMeetingRow }) {
  if (row.cancelled) return <p className="m-0">The meeting is cancelled. Its packet is closed.</p>
  return row.hasPacket ? (
    <Link href={`/board/meetings/${row.meetingId}`} className={LINK}>
      Open the packet
    </Link>
  ) : (
    <p>The packet is not ready yet.</p>
  )
}

function Meeting({ row }: { row: MemberMeetingRow }) {
  const marker = markerText(row)
  return (
    <>
      <p className="m-0 font-semibold">
        {meetingTitle(row)}
        {marker === null ? null : <Marker text={marker} />}
      </p>
      <RowAction row={row} />
    </>
  )
}

function MeetingList({ title, rows }: { title: string; rows: MemberMeetingRow[] }) {
  if (rows.length === 0) return null
  return (
    <section aria-label={title}>
      <h2>{title}</h2>
      <ul className="list-none divide-y p-0">
        {rows.map((row) => (
          <li key={row.meetingId} className="py-3">
            <Meeting row={row} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function requestLine(row: MemberBoardAssignmentRow): string {
  return row.commentBy === null
    ? `${row.boardShortName}.`
    : `${row.boardShortName}. Comments by ${formatCivilDate(row.commentBy)}.`
}

function CommentRequests({ rows }: { rows: MemberBoardAssignmentRow[] }) {
  if (rows.length === 0) return null
  return (
    <section aria-label="Sent to your board for comment">
      <h2>Sent to your board for comment</h2>
      <ul className="list-none divide-y p-0">
        {rows.map((row) => (
          <li key={row.assignmentId} className="py-3">
            <p className="m-0 font-semibold">
              <Link href={`/board/comments/${row.assignmentId}`} className={LINK}>
                {`Application ${row.number}, ${row.projectTitle}`}
              </Link>
            </p>
            <p className="m-0">{requestLine(row)}</p>
            <p className="m-0">{row.statusLabel}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function MeetingSections({ rows, today }: { rows: MemberMeetingRow[]; today: CivilDate }) {
  if (rows.length === 0) {
    return <p>No meeting packets are ready for you yet. You will get an email when one is.</p>
  }
  const { next, later, earlier } = splitMemberMeetings(rows, today)
  return (
    <>
      <section aria-label="Next meeting">
        <h2>Next meeting</h2>
        {next === null ? <p>No meeting of your board is coming up.</p> : <Meeting row={next} />}
      </section>
      <MeetingList title="Later meetings" rows={later} />
      <MeetingList title="Earlier meetings" rows={earlier} />
    </>
  )
}

export default async function BoardHomePage() {
  const ctx = await requirePortalContext('/board')
  if (!isBoardMember(ctx.actor)) {
    return (
      <main className="space-y-4">
        <h1>Board meetings</h1>
        <p role="alert">You do not have permission to read board packets.</p>
      </main>
    )
  }
  const [page, requests, today] = await Promise.all([
    listMemberMeetings(ctx.db, ctx.actor, { limit: PAGE_SIZE }, ctx.signal),
    listMemberBoardAssignments(ctx.db, ctx.actor, ctx.signal),
    townToday(ctx.db, new Date(), ctx.signal),
  ])
  return (
    <main className="space-y-6">
      <h1>Board meetings</h1>
      <CommentRequests rows={requests} />
      <MeetingSections rows={page.rows} today={today} />
    </main>
  )
}

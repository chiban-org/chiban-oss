import type { Metadata } from 'next'
import { BoardRefusal } from '@/components/board/BoardRefusal'
import { CommentRequests } from '@/components/board/CommentRequests'
import { MemberMeetings } from '@/components/board/MemberMeetings'
import { isBoardMember } from '@/features/access/predicates'
import { BOARD_HOME_TITLE } from '@/features/boards/memberCopy'
import { memberMeetingRecords } from '@/features/boards/memberMeetingRecords'
import { splitMemberMeetings } from '@/features/boards/memberMeetingSplit'
import { listMemberMeetings } from '@/features/boards/memberPackets'
import { listMemberBoardAssignments } from '@/features/reviews/boardAssignmentView'
import { townToday } from '@/features/town/today'
import { requirePortalContext } from '@/server/requirePortal'

export const metadata: Metadata = { title: BOARD_HOME_TITLE }

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

export default async function BoardHomePage() {
  const ctx = await requirePortalContext('/board')
  if (!isBoardMember(ctx.actor)) return <BoardRefusal />
  const [page, requests, today] = await Promise.all([
    listMemberMeetings(ctx.db, ctx.actor, { limit: PAGE_SIZE }, ctx.signal),
    listMemberBoardAssignments(ctx.db, ctx.actor, ctx.signal),
    townToday(ctx.db, new Date(), ctx.signal),
  ])
  const split = page.rows.length === 0 ? null : splitMemberMeetings(page.rows, today)
  const records = await memberMeetingRecords(ctx.db, {
    actor: ctx.actor,
    meetingIds: split?.earlier.map((row) => row.meetingId) ?? [],
    signal: ctx.signal,
  })
  return (
    <main className="space-y-6">
      <h1>{BOARD_HOME_TITLE}</h1>
      <CommentRequests rows={requests} today={today} />
      <MemberMeetings split={split} records={records} />
    </main>
  )
}

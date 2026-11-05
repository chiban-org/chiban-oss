import { and, count, eq, isNull, notInArray } from 'drizzle-orm'
import { applications, reviewAssignments } from '@/db/schema'
import { TERMINAL_STATES } from '@/features/applications/states'
import { markerText, meetingTitle, splitMemberMeetings } from '@/features/boards/memberMeetingSplit'
import { listMemberMeetings } from '@/features/boards/memberPackets'
import { REVIEWS_PATH } from '@/features/reviews/reviewList'
import type { HomeContext, HomeSection } from '@/features/staffHome/homeTypes'

const BOARD = '/board'
const MEETING_LIMIT = 50

export async function loadBoardSection(ctx: HomeContext): Promise<HomeSection | null> {
  const page = await listMemberMeetings(ctx.db, ctx.actor, { limit: MEETING_LIMIT }, ctx.signal)
  const { next, later } = splitMemberMeetings(page.rows, ctx.today)
  const fresh = [next, ...later].filter(
    (row) => row !== null && !row.cancelled && row.marker !== null,
  )
  return {
    role: 'board_member',
    title: 'Board meetings',
    urgency: 0,
    rows: [{ label: 'Packets new or updated for you', count: fresh.length, href: BOARD }],
    links: [{ label: 'Open board meetings', href: BOARD }],
    detail: {
      kind: 'meeting',
      next:
        next === null
          ? null
          : {
              label: meetingTitle(next),
              marker: markerText(next),
              href: next.hasPacket ? `${BOARD}/meetings/${next.meetingId}` : null,
            },
      later: later.length,
    },
  }
}

export async function loadReviewerSection(ctx: HomeContext): Promise<HomeSection | null> {
  ctx.signal.throwIfAborted()
  const [row] = await ctx.db
    .select({ n: count() })
    .from(reviewAssignments)
    .innerJoin(applications, eq(applications.id, reviewAssignments.applicationId))
    .where(
      and(
        eq(reviewAssignments.reviewerUserId, ctx.actor.userId),
        isNull(reviewAssignments.removedAt),
        eq(reviewAssignments.status, 'pending'),
        notInArray(applications.state, [...TERMINAL_STATES]),
      ),
    )
  return {
    role: 'reviewer',
    title: 'Reviews',
    urgency: 0,
    rows: [{ label: 'Reviews waiting on you', count: row?.n ?? 0, href: REVIEWS_PATH }],
    links: [{ label: 'Open your reviews', href: REVIEWS_PATH }],
    detail: null,
  }
}

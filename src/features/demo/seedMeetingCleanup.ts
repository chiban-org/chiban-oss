import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import {
  boardMeetings,
  boardPacketAccess,
  boardPacketItems,
  boardPacketLinks,
  boardPackets,
} from '@/db/schema'
import { cancelMeeting, scheduleMeeting } from '@/features/boards/meetings'
import type { CoverageContext } from '@/features/demo/seedCoverage'
import { must } from '@/features/demo/seedPermitSupport'
import { addDays } from '@/types/civilDate'

const STALE_PACKET_TITLE = 'Planning Board agenda'
const CANCELLED_LEAD_DAYS = 16
const CANCEL_SEARCH_DAYS = 30

export async function removeStaleDemoPacket(ctx: CoverageContext): Promise<boolean> {
  const stale = await ctx.db
    .select({ id: boardPackets.id })
    .from(boardPackets)
    .where(
      and(
        isNull(boardPackets.meetingId),
        eq(boardPackets.title, STALE_PACKET_TITLE),
        eq(boardPackets.createdBy, ctx.cast.staff.userId),
        sql`not exists (select 1 from board_meetings m
          where m.board = ${boardPackets}.board and m.meeting_date = ${boardPackets}.meeting_date)`,
      ),
    )
  const ids = stale.map((p) => p.id)
  if (ids.length === 0) return false
  const opened = await ctx.db
    .select({ id: boardPacketAccess.id })
    .from(boardPacketAccess)
    .innerJoin(boardPacketLinks, eq(boardPacketLinks.id, boardPacketAccess.linkId))
    .where(inArray(boardPacketLinks.packetId, ids))
    .limit(1)
  if (opened.length > 0) return false
  await ctx.db.transaction(async (tx) => {
    await tx.delete(boardPacketItems).where(inArray(boardPacketItems.packetId, ids))
    await tx.delete(boardPacketLinks).where(inArray(boardPacketLinks.packetId, ids))
    await tx.delete(boardPackets).where(inArray(boardPackets.id, ids))
  })
  return true
}

export async function seedCancelledMeeting(ctx: CoverageContext): Promise<boolean> {
  const [cancelled] = await ctx.db
    .select({ id: boardMeetings.id })
    .from(boardMeetings)
    .where(eq(boardMeetings.status, 'cancelled'))
    .limit(1)
  if (cancelled !== undefined) return false
  for (let offset = 0; offset < CANCEL_SEARCH_DAYS; offset += 1) {
    const scheduled = await scheduleMeeting(
      ctx.db,
      ctx.cast.staff,
      {
        board: 'zba',
        meetingDate: addDays(ctx.today, CANCELLED_LEAD_DAYS + offset),
        kind: 'special',
        location: 'Alder Pond Town Hall, Meeting Room 2',
      },
      ctx.signal,
    )
    if (!scheduled.ok && scheduled.error === 'already_scheduled') continue
    const { meetingId } = must(scheduled, 'special meeting')
    must(
      await cancelMeeting(
        ctx.db,
        ctx.cast.staff,
        { meetingId, reason: 'Two members cannot attend, so the board would lack a quorum.' },
        ctx.signal,
        ctx.now,
      ),
      'cancel special meeting',
    )
    return true
  }
  return false
}

import { asc, eq, gte } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardMeetings, boardPackets } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardLabel, getBoardSettings } from '@/features/boards/boardSettings'
import { packetStateForMeeting } from '@/features/boards/packetPanel'
import type { PacketStateKind } from '@/features/boards/packetState'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { err, ok, type Result } from '@/types/result'
import { isUuid } from '@/utils/uuid'

export interface PacketsIndexRow {
  meetingId: string
  meetingDate: string
  dateText: string
  boardName: string
  kindText: string
  state: string
  stateKind: PacketStateKind
  href: string
}

export async function loadPacketsIndex(
  db: Db,
  actor: Actor,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<PacketsIndexRow[], 'forbidden'>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'packet.manage', signal))) return err('forbidden')
  const today = await townToday(db, now, signal)
  const settings = await getBoardSettings(db, signal)
  const meetings = await db
    .select()
    .from(boardMeetings)
    .where(gte(boardMeetings.meetingDate, today))
    .orderBy(asc(boardMeetings.meetingDate), asc(boardMeetings.board), asc(boardMeetings.id))
  const rows: PacketsIndexRow[] = []
  for (const meeting of meetings) {
    const state = await packetStateForMeeting(db, meeting, signal)
    rows.push({
      meetingId: meeting.id,
      meetingDate: meeting.meetingDate,
      dateText: formatCivilDate(meeting.meetingDate),
      boardName: boardLabel(settings, meeting.board),
      kindText: meeting.kind === 'special' ? 'Special meeting' : 'Regular meeting',
      state: state.label,
      stateKind: state.kind,
      href: `/staff/boards/meetings/${meeting.id}#packet`,
    })
  }
  return ok(rows)
}

export async function packetHref(db: Db, packetId: string): Promise<string> {
  const index = '/staff/boards/packets'
  if (!isUuid(packetId)) return index
  const [packet] = await db
    .select({ meetingId: boardPackets.meetingId })
    .from(boardPackets)
    .where(eq(boardPackets.id, packetId))
  return packet?.meetingId == null ? index : `/staff/boards/meetings/${packet.meetingId}#packet`
}

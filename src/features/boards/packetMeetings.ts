import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardMeetings, boardPackets } from '@/db/schema'
import { BOARD_NAMES } from '@/features/hearings/views'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

export interface PacketMeetingChoice {
  id: string
  label: string
}

export async function packetMeetingChoices(
  db: Db,
  today: CivilDate,
  signal: AbortSignal,
): Promise<PacketMeetingChoice[]> {
  signal.throwIfAborted()
  const past = sql<boolean>`${boardMeetings.meetingDate} < ${today}`
  const rows = await db
    .select({
      id: boardMeetings.id,
      board: boardMeetings.board,
      kind: boardMeetings.kind,
      meetingDate: boardMeetings.meetingDate,
      past,
    })
    .from(boardMeetings)
    .leftJoin(boardPackets, eq(boardPackets.meetingId, boardMeetings.id))
    .where(and(eq(boardMeetings.status, 'scheduled'), isNull(boardPackets.id)))
    .orderBy(
      asc(past),
      asc(sql`case when ${past} then null else ${boardMeetings.meetingDate} end`),
      desc(boardMeetings.meetingDate),
      asc(boardMeetings.board),
      asc(boardMeetings.id),
    )
  return rows.map((r) => {
    const name =
      r.kind === 'special' ? `${BOARD_NAMES[r.board]} special meeting` : BOARD_NAMES[r.board]
    const held = r.past ? ' (already held)' : ''
    return { id: r.id, label: `${name}, ${formatCivilDate(r.meetingDate)}${held}` }
  })
}

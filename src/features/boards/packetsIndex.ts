import { asc, desc, eq, gte, isNull } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardMeetings, boardPackets } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardLabel, getBoardSettings } from '@/features/boards/boardSettings'
import { packetStateForMeeting } from '@/features/boards/packetPanel'
import type { PacketStateKind } from '@/features/boards/packetState'
import { type TrackRow, trackPacket } from '@/features/boards/packetTrack'
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
  needsWork: boolean
  href: string
}

export interface UnlinkedPacket {
  id: string
  title: string
  dateText: string
  href: string
}

export interface PacketsIndex {
  meetings: PacketsIndexRow[]
  unlinked: UnlinkedPacket[]
}

async function unlinkedPackets(db: Db): Promise<UnlinkedPacket[]> {
  const rows = await db
    .select()
    .from(boardPackets)
    .where(isNull(boardPackets.meetingId))
    .orderBy(desc(boardPackets.meetingDate), asc(boardPackets.id))
  return rows.map((p) => ({
    id: p.id,
    title: p.title,
    dateText: formatCivilDate(p.meetingDate),
    href: `/staff/boards/packets/${p.id}`,
  }))
}

export async function loadPacketsIndex(
  db: Db,
  actor: Actor,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<PacketsIndex, 'forbidden'>> {
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
      needsWork: state.needsWork,
      href: `/staff/boards/meetings/${meeting.id}#packet`,
    })
  }
  return ok({ meetings: rows, unlinked: await unlinkedPackets(db) })
}

export type LegacyPacketPage =
  | { kind: 'redirect'; href: string }
  | { kind: 'legacy'; title: string; dateText: string; links: TrackRow[] }

export async function legacyPacketPage(
  db: Db,
  actor: Actor,
  packetId: string,
  signal: AbortSignal,
): Promise<Result<LegacyPacketPage, 'forbidden'>> {
  if (!(await hasCapability(db, actor.userId, 'packet.manage', signal))) return err('forbidden')
  const index = { kind: 'redirect', href: '/staff/boards/packets' } as const
  if (!isUuid(packetId)) return ok(index)
  const [packet] = await db.select().from(boardPackets).where(eq(boardPackets.id, packetId))
  if (packet === undefined) return ok(index)
  if (packet.meetingId !== null) {
    return ok({ kind: 'redirect', href: `/staff/boards/meetings/${packet.meetingId}#packet` })
  }
  return ok({
    kind: 'legacy',
    title: packet.title,
    dateText: formatCivilDate(packet.meetingDate),
    links: (await trackPacket(db, packet.id)).filter((r) => r.gets.kind === 'link'),
  })
}

import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { agendas, boardMeetings, boardPacketMembers, boardPackets } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { agendaReplacement } from '@/features/boards/packetAgenda'
import {
  changeCount,
  changeSummary,
  type PendingChanges,
  pendingChanges,
} from '@/features/boards/packetChanges'
import { packetItemRows } from '@/features/boards/packetContents'
import { gatherPacket, type PacketGather } from '@/features/boards/packetGather'
import { type ReviewLine, reviewLines } from '@/features/boards/packetReview'
import { boardMembersOf } from '@/features/boards/packetSend'
import { type PacketState, packetStateOf } from '@/features/boards/packetState'
import { type TrackRow, trackPacket } from '@/features/boards/packetTrack'
import { boardLabel, getBoard } from '@/features/boards/townBoards'
import { timeZoneOf } from '@/features/hearings/views'
import { todayInTimeZone } from '@/types/civilDate'

export interface PacketSendView {
  packetId: string
  title: string
  sent: boolean
  members: number
  membersNotSent: number
  pending: number
  pendingSummary: string
}

export interface PacketPanel {
  meetingId: string
  boardName: string
  state: PacketState
  zone: string
  canShare: boolean
  gather: PacketGather | null
  review: { packetId: string; title: string; lines: ReviewLine[] } | null
  send: PacketSendView | null
  recipients: TrackRow[]
  agendaChanged: boolean
}

async function packetOf(db: Db, meetingId: string) {
  const [packet] = await db.select().from(boardPackets).where(eq(boardPackets.meetingId, meetingId))
  return packet ?? null
}

async function stateFor(
  db: Db,
  context: { cancelled: boolean; agendaPublished: boolean; zone: string },
  packet: typeof boardPackets.$inferSelect | null,
  recipients: TrackRow[],
) {
  const pending =
    packet === null ? 0 : changeCount(pendingChanges(await packetItemRows(db, packet.id), packet))
  return packetStateOf({
    cancelled: context.cancelled,
    agendaPublished: context.agendaPublished,
    hasPacket: packet !== null,
    sentOn: packet?.sentAt == null ? null : todayInTimeZone(context.zone, packet.sentAt),
    pending,
    members: recipients.filter((r) => r.gets.kind === 'member').length,
    outside: recipients.filter((r) => r.gets.kind === 'link').length,
  })
}

export async function packetStateForMeeting(
  db: Db,
  meeting: typeof boardMeetings.$inferSelect,
  signal: AbortSignal,
): Promise<PacketState> {
  const [agenda] = await db.select().from(agendas).where(eq(agendas.meetingId, meeting.id))
  const packet = await packetOf(db, meeting.id)
  const recipients = packet === null ? [] : await trackPacket(db, packet.id)
  const zone = await timeZoneOf(db, signal)
  return await stateFor(
    db,
    {
      cancelled: meeting.status === 'cancelled',
      agendaPublished: agenda?.status === 'published',
      zone,
    },
    packet,
    recipients,
  )
}

async function sendView(
  db: Db,
  packet: typeof boardPackets.$inferSelect,
  changes: PendingChanges,
): Promise<PacketSendView> {
  const members = await boardMembersOf(db, packet.boardId)
  const sentTo = await db
    .select({ userId: boardPacketMembers.userId })
    .from(boardPacketMembers)
    .where(eq(boardPacketMembers.packetId, packet.id))
  const sent = new Set(sentTo.map((s) => s.userId))
  return {
    packetId: packet.id,
    title: packet.title,
    sent: packet.sentAt !== null,
    members: members.length,
    membersNotSent: members.filter((m) => !sent.has(m.userId)).length,
    pending: changeCount(changes),
    pendingSummary: changeSummary(changes),
  }
}

export async function loadPacketPanel(
  db: Db,
  actor: Actor,
  meetingId: string,
  signal: AbortSignal,
): Promise<PacketPanel | null> {
  if (!(await hasCapability(db, actor.userId, 'packet.manage', signal))) return null
  const [meeting] = await db.select().from(boardMeetings).where(eq(boardMeetings.id, meetingId))
  if (meeting === undefined) return null
  const zone = await timeZoneOf(db, signal)
  const packet = await packetOf(db, meetingId)
  const recipients = packet === null ? [] : await trackPacket(db, packet.id)
  const state = await packetStateForMeeting(db, meeting, signal)
  const gathered =
    state.kind === 'cancelled' ? null : await gatherPacket(db, actor, meetingId, signal)
  const gather = gathered?.ok === true ? gathered.value : null
  const rows = packet === null ? [] : await packetItemRows(db, packet.id)
  const changes = packet === null ? null : pendingChanges(rows, packet)
  const open = packet !== null && state.kind !== 'cancelled'
  return {
    meetingId,
    boardName: boardLabel((await getBoard(db, meeting.boardId)) ?? { name: '' }),
    state,
    zone,
    canShare: await hasCapability(db, actor.userId, 'document.manage', signal),
    gather,
    review: open
      ? { packetId: packet.id, title: packet.title, lines: reviewLines(rows, packet) }
      : null,
    send: open && changes !== null ? await sendView(db, packet, changes) : null,
    recipients,
    agendaChanged: open ? (await agendaReplacement(db, packet.id, meetingId)) !== null : false,
  }
}

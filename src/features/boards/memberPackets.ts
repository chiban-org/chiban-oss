import { and, desc, eq, lt, or, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { agendas, boardMeetings, boardPacketAccess, boardPackets } from '@/db/schema'
import {
  activeMembershipOn,
  isBoardMember,
  memberCanSeeMeeting,
} from '@/features/access/predicates'
import type { Actor } from '@/features/auth/actor'
import { packetItemRows, readerItems } from '@/features/boards/packetContents'
import { type PacketDocumentError, packetDocument } from '@/features/boards/packetDocument'
import { type PacketViewItem, townDateOf, viewItems } from '@/features/boards/packetView'
import type { StoredObject } from '@/features/storage/delivery'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface MemberPacketView {
  packetId: string
  title: string
  board: 'planning_board' | 'zba'
  meetingDate: CivilDate
  items: PacketViewItem[]
}

export type MemberMarker = { kind: 'new' } | { kind: 'updated'; on: CivilDate } | null

export interface MemberMeetingRow {
  meetingId: string
  board: 'planning_board' | 'zba'
  meetingDate: CivilDate
  agendaDocumentId: string | null
  cancelled: boolean
  hasPacket: boolean
  marker: MemberMarker
}

function decodeCursor(cursor: string): { date: string; id: string } | null {
  const [date, id] = cursor.split('|')
  return date === undefined || id === undefined ? null : { date, id }
}

function asInstant(value: unknown): Date | null {
  if (value instanceof Date) return value
  return typeof value === 'string' ? new Date(value) : null
}

function packetColumn(column: 'sent_at' | 'last_sent_at') {
  return sql`(select bp.${sql.raw(column)} from board_packets bp where bp.meeting_id = ${boardMeetings.id})`.mapWith(
    asInstant,
  )
}

interface MarkerInput {
  sentAt: Date | null
  lastSentAt: Date | null
  lastReadAt: Date | null
}

async function markerOf(db: Db, row: MarkerInput, signal: AbortSignal): Promise<MemberMarker> {
  if (row.sentAt === null || row.lastSentAt === null) return null
  if (row.lastReadAt === null) return { kind: 'new' }
  const updated = row.lastSentAt.getTime() > row.sentAt.getTime()
  if (!updated || row.lastSentAt.getTime() <= row.lastReadAt.getTime()) return null
  return { kind: 'updated', on: await townDateOf(db, row.lastSentAt, signal) }
}

export async function listMemberMeetings(
  db: Db,
  actor: Actor,
  input: { limit: number; cursor?: string },
  signal: AbortSignal,
): Promise<{ rows: MemberMeetingRow[]; nextCursor: string | null }> {
  signal.throwIfAborted()
  if (!isBoardMember(actor)) return { rows: [], nextCursor: null }
  const after = input.cursor === undefined ? null : decodeCursor(input.cursor)
  const afterClause =
    after === null
      ? undefined
      : or(
          lt(boardMeetings.meetingDate, after.date),
          and(eq(boardMeetings.meetingDate, after.date), lt(boardMeetings.id, after.id)),
        )
  const rows = await db
    .select({
      meetingId: boardMeetings.id,
      board: boardMeetings.board,
      meetingDate: boardMeetings.meetingDate,
      status: boardMeetings.status,
      agendaDocumentId: agendas.documentId,
      sentAt: packetColumn('sent_at'),
      lastSentAt: packetColumn('last_sent_at'),
      lastReadAt: sql`(select max(a.accessed_at) from board_packet_access a
        join board_packets bp on bp.id = a.packet_id
        where bp.meeting_id = ${boardMeetings.id} and a.user_id = ${actor.userId})`.mapWith(
        asInstant,
      ),
    })
    .from(boardMeetings)
    .innerJoin(
      agendas,
      and(eq(agendas.meetingId, boardMeetings.id), eq(agendas.status, 'published')),
    )
    .where(and(activeMembershipOn(actor.userId, sql`${boardMeetings.board}`), afterClause))
    .orderBy(desc(boardMeetings.meetingDate), desc(boardMeetings.id))
    .limit(input.limit + 1)
  const page = rows.slice(0, input.limit)
  const last = page.at(-1)
  const out: MemberMeetingRow[] = []
  for (const r of page) {
    const cancelled = r.status === 'cancelled'
    out.push({
      meetingId: r.meetingId,
      board: r.board,
      meetingDate: r.meetingDate as CivilDate,
      agendaDocumentId: r.agendaDocumentId,
      cancelled,
      hasPacket: !cancelled && r.sentAt !== null,
      marker: cancelled ? null : await markerOf(db, r, signal),
    })
  }
  return {
    rows: out,
    nextCursor:
      rows.length > input.limit && last !== undefined
        ? `${last.meetingDate}|${last.meetingId}`
        : null,
  }
}

async function sentPacketFor(db: Db, actor: Actor, meetingId: string) {
  if (!isBoardMember(actor)) return null
  const [row] = await db
    .select({ packet: boardPackets })
    .from(boardPackets)
    .innerJoin(boardMeetings, eq(boardMeetings.id, boardPackets.meetingId))
    .where(
      and(
        eq(boardMeetings.id, meetingId),
        memberCanSeeMeeting(actor.userId, sql`${boardMeetings.id}`),
      ),
    )
  return row === undefined || row.packet.sentAt === null ? null : row.packet
}

export async function memberPacketView(
  db: Db,
  actor: Actor,
  meetingId: string,
  signal: AbortSignal,
): Promise<Result<MemberPacketView, 'not_found'>> {
  signal.throwIfAborted()
  const packet = await sentPacketFor(db, actor, meetingId)
  if (packet === null) return err('not_found')
  const rows = await packetItemRows(db, packet.id)
  return ok({
    packetId: packet.id,
    title: packet.title,
    board: packet.board,
    meetingDate: packet.meetingDate as CivilDate,
    items: await viewItems(db, readerItems(rows, packet), signal),
  })
}

export async function getMemberPacket(
  db: Db,
  actor: Actor,
  meetingId: string,
  signal: AbortSignal,
): Promise<Result<MemberPacketView, 'not_found'>> {
  const view = await memberPacketView(db, actor, meetingId, signal)
  if (!view.ok) return view
  await db
    .insert(boardPacketAccess)
    .values({ userId: actor.userId, packetId: view.value.packetId, versionId: null })
  return view
}

export async function openMemberPacketVersion(
  db: Db,
  actor: Actor,
  input: { meetingId: string; versionId: string },
  signal: AbortSignal,
): Promise<Result<StoredObject, PacketDocumentError>> {
  signal.throwIfAborted()
  const packet = await sentPacketFor(db, actor, input.meetingId)
  if (packet === null) return err('not_found')
  const found = await packetDocument(db, packet, input.versionId, signal)
  if (!found.ok) return found
  await db
    .insert(boardPacketAccess)
    .values({ userId: actor.userId, packetId: packet.id, versionId: input.versionId })
  return found
}

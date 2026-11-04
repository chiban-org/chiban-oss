import { and, asc, desc, eq, lt, or, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  agendas,
  boardMeetings,
  boardPacketAccess,
  boardPacketItems,
  boardPackets,
  documents,
  documentVersions,
  files,
} from '@/db/schema'
import {
  activeMembershipOn,
  isBoardMember,
  memberCanSeeMeeting,
} from '@/features/access/predicates'
import type { Actor } from '@/features/auth/actor'
import { townDateOf } from '@/features/boards/packetLinks'
import type { StoredObject } from '@/features/storage/delivery'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface MemberPacketView {
  packetId: string
  title: string
  board: 'planning_board' | 'zba'
  meetingDate: CivilDate
  items: { versionId: string; title: string; filename: string; withdrawnOn: CivilDate | null }[]
}

export interface MemberMeetingRow {
  meetingId: string
  board: 'planning_board' | 'zba'
  meetingDate: CivilDate
  agendaDocumentId: string | null
  hasPacket: boolean
}

function decodeCursor(cursor: string): { date: string; id: string } | null {
  const [date, id] = cursor.split('|')
  return date === undefined || id === undefined ? null : { date, id }
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
      agendaDocumentId: agendas.documentId,
      hasPacket: sql<boolean>`exists (select 1 from board_packets bp where bp.meeting_id = ${boardMeetings.id})`,
    })
    .from(boardMeetings)
    .innerJoin(
      agendas,
      and(eq(agendas.meetingId, boardMeetings.id), eq(agendas.status, 'published')),
    )
    .where(
      and(
        eq(boardMeetings.status, 'scheduled'),
        activeMembershipOn(actor.userId, sql`${boardMeetings.board}`),
        afterClause,
      ),
    )
    .orderBy(desc(boardMeetings.meetingDate), desc(boardMeetings.id))
    .limit(input.limit + 1)
  const page = rows.slice(0, input.limit)
  const last = page.at(-1)
  return {
    rows: page.map((r) => ({ ...r, meetingDate: r.meetingDate as CivilDate })),
    nextCursor:
      rows.length > input.limit && last !== undefined
        ? `${last.meetingDate}|${last.meetingId}`
        : null,
  }
}

async function visibleMeeting(db: Db, actor: Actor, meetingId: string) {
  if (!isBoardMember(actor)) return null
  const [meeting] = await db
    .select()
    .from(boardMeetings)
    .where(
      and(
        eq(boardMeetings.id, meetingId),
        memberCanSeeMeeting(actor.userId, sql`${boardMeetings.id}`),
      ),
    )
  return meeting ?? null
}

async function packetFor(db: Db, meeting: typeof boardMeetings.$inferSelect) {
  const [packet] = await db
    .select()
    .from(boardPackets)
    .where(eq(boardPackets.meetingId, meeting.id))
  return packet ?? null
}

export async function getMemberPacket(
  db: Db,
  actor: Actor,
  meetingId: string,
  signal: AbortSignal,
): Promise<Result<MemberPacketView, 'not_found'>> {
  signal.throwIfAborted()
  const meeting = await visibleMeeting(db, actor, meetingId)
  if (meeting === null) return err('not_found')
  const packet = await packetFor(db, meeting)
  if (packet === null) return err('not_found')
  const items = await db
    .select({
      versionId: boardPacketItems.versionId,
      formerVersionId: boardPacketItems.formerVersionId,
      title: documents.title,
      filename: documentVersions.filename,
      withdrawnAt: boardPacketItems.withdrawnAt,
    })
    .from(boardPacketItems)
    .innerJoin(documents, eq(documents.id, boardPacketItems.documentId))
    .leftJoin(documentVersions, eq(documentVersions.id, boardPacketItems.versionId))
    .where(eq(boardPacketItems.packetId, packet.id))
    .orderBy(asc(boardPacketItems.position))
  await db.insert(boardPacketAccess).values({ userId: actor.userId, versionId: null })
  return ok({
    packetId: packet.id,
    title: packet.title,
    board: packet.board,
    meetingDate: packet.meetingDate as CivilDate,
    items: await Promise.all(
      items.map(async ({ withdrawnAt, formerVersionId, ...item }) => ({
        title: item.title,
        versionId: item.versionId ?? formerVersionId ?? '',
        filename: item.filename ?? '',
        withdrawnOn: withdrawnAt === null ? null : await townDateOf(db, withdrawnAt, signal),
      })),
    ),
  })
}

export async function openMemberPacketVersion(
  db: Db,
  actor: Actor,
  input: { meetingId: string; versionId: string },
  signal: AbortSignal,
): Promise<Result<StoredObject, 'not_found' | { withdrawnOn: CivilDate }>> {
  signal.throwIfAborted()
  const meeting = await visibleMeeting(db, actor, input.meetingId)
  if (meeting === null) return err('not_found')
  const packet = await packetFor(db, meeting)
  if (packet === null) return err('not_found')
  const [row] = await db
    .select({
      storageKey: files.storageKey,
      filename: documentVersions.filename,
      contentType: documentVersions.contentType,
      withdrawnAt: boardPacketItems.withdrawnAt,
    })
    .from(boardPacketItems)
    .leftJoin(documentVersions, eq(documentVersions.id, boardPacketItems.versionId))
    .leftJoin(files, eq(files.sha256, documentVersions.fileSha256))
    .where(
      and(
        eq(boardPacketItems.packetId, packet.id),
        or(
          eq(boardPacketItems.versionId, input.versionId),
          eq(boardPacketItems.formerVersionId, input.versionId),
        ),
      ),
    )
  if (row === undefined) return err('not_found')
  if (row.withdrawnAt !== null) {
    return err({ withdrawnOn: await townDateOf(db, row.withdrawnAt, signal) })
  }
  if (row.storageKey === null || row.filename === null || row.contentType === null) {
    return err('not_found')
  }
  await db.insert(boardPacketAccess).values({ userId: actor.userId, versionId: input.versionId })
  return ok({ storageKey: row.storageKey, filename: row.filename, contentType: row.contentType })
}

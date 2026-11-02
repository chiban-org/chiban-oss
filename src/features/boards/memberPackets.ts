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
import type { ObjectStore } from '@/features/storage/objectStore'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const DOWNLOAD_SECONDS = 60

export interface MemberPacketView {
  packetId: string
  title: string
  board: 'planning_board' | 'zba'
  meetingDate: CivilDate
  items: { versionId: string; title: string; filename: string }[]
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
      hasPacket: sql<boolean>`exists (select 1 from board_packets bp where bp.board = ${boardMeetings.board} and bp.meeting_date = ${boardMeetings.meetingDate})`,
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
    .where(
      and(eq(boardPackets.board, meeting.board), eq(boardPackets.meetingDate, meeting.meetingDate)),
    )
    .orderBy(desc(boardPackets.createdAt))
    .limit(1)
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
      title: documents.title,
      filename: documentVersions.filename,
    })
    .from(boardPacketItems)
    .innerJoin(documents, eq(documents.id, boardPacketItems.documentId))
    .innerJoin(documentVersions, eq(documentVersions.id, boardPacketItems.versionId))
    .where(eq(boardPacketItems.packetId, packet.id))
    .orderBy(asc(boardPacketItems.position))
  await db.insert(boardPacketAccess).values({ userId: actor.userId, versionId: null })
  return ok({
    packetId: packet.id,
    title: packet.title,
    board: packet.board,
    meetingDate: packet.meetingDate as CivilDate,
    items,
  })
}

export async function openMemberPacketVersion(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  input: { meetingId: string; versionId: string },
  signal: AbortSignal,
): Promise<Result<{ url: string }, 'not_found'>> {
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
    })
    .from(boardPacketItems)
    .innerJoin(documentVersions, eq(documentVersions.id, boardPacketItems.versionId))
    .innerJoin(files, eq(files.sha256, documentVersions.fileSha256))
    .where(
      and(
        eq(boardPacketItems.packetId, packet.id),
        eq(boardPacketItems.versionId, input.versionId),
      ),
    )
  if (row === undefined) return err('not_found')
  await db.insert(boardPacketAccess).values({ userId: actor.userId, versionId: input.versionId })
  const url = await store.presignGet(row.storageKey, {
    expiresSeconds: DOWNLOAD_SECONDS,
    filename: row.filename,
    contentType: row.contentType,
    disposition: 'inline',
  })
  return ok({ url })
}

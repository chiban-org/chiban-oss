import { BOARD_KIND_TRAITS, type BoardKind } from '@packs/nh/boardSchema'
import { and, eq, gte, isNull, notInArray, or, sql } from 'drizzle-orm'
import type { Db, DbOrTx, Tx } from '@/db/client'
import { applications, boardMeetings, boardPacketLinks, boardPackets, boards } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { loadApplicationContext } from '@/features/applications/context'
import { TERMINAL_STATES } from '@/features/applications/states'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { boardOfApplication } from '@/features/boards/boardOf'
import { activeBoards, type BoardRow, getBoard } from '@/features/boards/townBoards'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'

export interface BoardNames {
  name: string
  shortName: string
}

export type CreateBoardError = 'forbidden' | 'name_taken' | 'kind_taken'
export type RenameBoardError = 'forbidden' | 'not_found' | 'archived' | 'name_taken'
export type ArchiveBoardError =
  | 'forbidden'
  | 'not_found'
  | 'already_archived'
  | { blocked: string[] }

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function nameTaken(active: BoardRow[], name: string, exceptId?: string): boolean {
  return active.some((b) => b.id !== exceptId && sameName(b.name, name))
}

export async function createBoard(
  db: Db,
  actor: Actor,
  input: BoardNames & { kind: BoardKind },
  signal: AbortSignal,
): Promise<Result<{ boardId: string }, CreateBoardError>> {
  signal.throwIfAborted()
  if (!(await requireCapability(db, actor.userId, 'config.edit', signal)).ok) {
    return err('forbidden')
  }
  return await transactionResult(db, async (tx: Tx) => {
    const active = await activeBoards(tx)
    if (nameTaken(active, input.name)) return err('name_taken')
    if (BOARD_KIND_TRAITS[input.kind].uniquePerTown && active.some((b) => b.kind === input.kind)) {
      return err('kind_taken')
    }
    const [row] = await tx
      .insert(boards)
      .values({
        kind: input.kind,
        name: input.name.trim(),
        shortName: input.shortName.trim(),
        createdBy: actor.userId,
      })
      .returning({ id: boards.id })
    const boardId = row?.id ?? ''
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'board.create',
        entityType: 'board',
        entityId: boardId,
        after: { kind: input.kind, name: input.name.trim(), shortName: input.shortName.trim() },
      },
      signal,
    )
    return ok({ boardId })
  })
}

export async function renameBoard(
  db: Db,
  actor: Actor,
  input: BoardNames & { boardId: string },
  signal: AbortSignal,
): Promise<Result<void, RenameBoardError>> {
  signal.throwIfAborted()
  if (!(await requireCapability(db, actor.userId, 'config.edit', signal)).ok) {
    return err('forbidden')
  }
  return await transactionResult(db, async (tx: Tx) => {
    const board = await getBoard(tx, input.boardId)
    if (board === null) return err('not_found')
    if (board.archivedAt !== null) return err('archived')
    if (nameTaken(await activeBoards(tx), input.name, board.id)) return err('name_taken')
    const next = { name: input.name.trim(), shortName: input.shortName.trim() }
    await tx.update(boards).set(next).where(eq(boards.id, board.id))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'board.rename',
        entityType: 'board',
        entityId: board.id,
        before: { name: board.name, shortName: board.shortName },
        after: next,
      },
      signal,
    )
    return ok(undefined)
  })
}

async function meetingBlocker(db: DbOrTx, boardId: string, today: string): Promise<string[]> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(boardMeetings)
    .where(
      and(
        eq(boardMeetings.boardId, boardId),
        eq(boardMeetings.status, 'scheduled'),
        gte(boardMeetings.meetingDate, today),
      ),
    )
  const n = row?.n ?? 0
  if (n === 0) return []
  return [
    n === 1
      ? 'It has 1 scheduled meeting ahead. Cancel it first.'
      : `It has ${String(n)} scheduled meetings ahead. Cancel them first.`,
  ]
}

async function packetBlocker(
  db: DbOrTx,
  boardId: string,
  today: string,
  now: Date,
): Promise<string[]> {
  const [unsent] = await db
    .select({ id: boardPackets.id })
    .from(boardPackets)
    .leftJoin(boardMeetings, eq(boardMeetings.id, boardPackets.meetingId))
    .where(
      and(
        eq(boardPackets.boardId, boardId),
        isNull(boardPackets.sentAt),
        gte(boardPackets.meetingDate, today),
        or(isNull(boardPackets.meetingId), eq(boardMeetings.status, 'scheduled')),
      ),
    )
    .limit(1)
  const [open] = await db
    .select({ id: boardPacketLinks.id })
    .from(boardPacketLinks)
    .innerJoin(boardPackets, eq(boardPackets.id, boardPacketLinks.packetId))
    .where(
      and(
        eq(boardPackets.boardId, boardId),
        isNull(boardPacketLinks.revokedAt),
        sql`${boardPacketLinks.expiresAt} > ${now}`,
      ),
    )
    .limit(1)
  return unsent === undefined && open === undefined
    ? []
    : ['It has a packet that has not been sent or is still open.']
}

async function applicationBlocker(
  db: DbOrTx,
  board: BoardRow,
  signal: AbortSignal,
): Promise<string[]> {
  if (!BOARD_KIND_TRAITS[board.kind].decidesApplications) return []
  const rows = await db
    .select({ id: applications.id })
    .from(applications)
    .where(notInArray(applications.state, [...TERMINAL_STATES]))
  let open = 0
  for (const { id } of rows) {
    const app = await loadApplicationContext(db, id, signal)
    if (app !== null && boardOfApplication(app) === board.kind) open += 1
  }
  return open === 0
    ? []
    : [`${BOARD_KIND_TRAITS[board.kind].label} applications still open: ${String(open)}.`]
}

export async function archiveBlockers(
  db: DbOrTx,
  board: BoardRow,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<string[]> {
  const today = await townToday(db, now, signal)
  return [
    ...(await meetingBlocker(db, board.id, today)),
    ...(await packetBlocker(db, board.id, today, now)),
    ...(await applicationBlocker(db, board, signal)),
  ]
}

export async function archiveBoard(
  db: Db,
  actor: Actor,
  input: { boardId: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, ArchiveBoardError>> {
  signal.throwIfAborted()
  if (!(await requireCapability(db, actor.userId, 'config.edit', signal)).ok) {
    return err('forbidden')
  }
  return await transactionResult<void, ArchiveBoardError>(db, async (tx: Tx) => {
    const board = await getBoard(tx, input.boardId)
    if (board === null) return err('not_found')
    if (board.archivedAt !== null) return err('already_archived')
    const blocked = await archiveBlockers(tx, board, signal, now)
    if (blocked.length > 0) return err({ blocked })
    await tx.update(boards).set({ archivedAt: now }).where(eq(boards.id, board.id))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'board.archive',
        entityType: 'board',
        entityId: board.id,
        before: { archivedAt: null },
        after: { archivedAt: now.toISOString() },
      },
      signal,
    )
    return ok(undefined)
  })
}

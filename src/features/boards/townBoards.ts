import { BOARD_KIND_TRAITS, type BoardKind } from '@packs/nh/boardSchema'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { DbOrTx } from '@/db/client'
import { type BoardRow, boardMemberships, boards, users } from '@/db/schema'
import { TOWN_TODAY } from '@/features/access/predicates'

export type { BoardRow }

const KIND_ORDER = sql`case ${boards.kind} when 'planning_board' then 0 when 'zba' then 1 else 2 end`

export async function activeBoards(db: DbOrTx): Promise<BoardRow[]> {
  return await db
    .select()
    .from(boards)
    .where(isNull(boards.archivedAt))
    .orderBy(KIND_ORDER, asc(boards.name))
}

export async function allBoards(db: DbOrTx): Promise<BoardRow[]> {
  return await db.select().from(boards).orderBy(KIND_ORDER, asc(boards.name))
}

export async function getBoard(db: DbOrTx, id: string): Promise<BoardRow | null> {
  const [row] = await db.select().from(boards).where(eq(boards.id, id))
  return row ?? null
}

export async function getBoardLocked(db: DbOrTx, id: string): Promise<BoardRow | null> {
  const [row] = await db.select().from(boards).where(eq(boards.id, id)).for('update')
  return row ?? null
}

export async function boardsById(
  db: DbOrTx,
  ids: readonly string[],
): Promise<Map<string, BoardRow>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .select()
    .from(boards)
    .where(inArray(boards.id, [...new Set(ids)]))
  return new Map(rows.map((row) => [row.id, row]))
}

export async function boardForKind(
  db: DbOrTx,
  kind: BoardKind,
  signal: AbortSignal,
): Promise<BoardRow | null> {
  signal.throwIfAborted()
  const [row] = await db
    .select()
    .from(boards)
    .where(and(eq(boards.kind, kind), isNull(boards.archivedAt)))
    .orderBy(asc(boards.createdAt))
    .limit(1)
  return row ?? null
}

export function boardLabel(board: Pick<BoardRow, 'name'>): string {
  return board.name
}

export function missingBoardMessage(kind: BoardKind): string {
  return `This town has no ${BOARD_KIND_TRAITS[kind].label} set up. Add one in Settings, Boards.`
}

export function boardDecidesApplications(kind: BoardKind): boolean {
  return BOARD_KIND_TRAITS[kind].decidesApplications
}

export interface BoardMergeValues {
  'board.name': string
  'board.short_name': string
  'board.chair.name': string
}

export async function boardChairName(db: DbOrTx, boardId: string): Promise<string> {
  const [row] = await db
    .select({ name: users.displayName })
    .from(boardMemberships)
    .innerJoin(users, eq(users.id, boardMemberships.userId))
    .where(
      and(
        eq(boardMemberships.boardId, boardId),
        eq(boardMemberships.title, 'chair'),
        sql`${boardMemberships.termStart} <= ${TOWN_TODAY}`,
        sql`(${boardMemberships.termEnd} is null or ${boardMemberships.termEnd} >= ${TOWN_TODAY})`,
      ),
    )
    .orderBy(asc(boardMemberships.termStart), asc(boardMemberships.id))
    .limit(1)
  return row?.name ?? ''
}

export async function boardMergeValues(
  db: DbOrTx,
  board: Pick<BoardRow, 'id' | 'name' | 'shortName'> | null,
): Promise<BoardMergeValues> {
  if (board === null) {
    return { 'board.name': '', 'board.short_name': '', 'board.chair.name': '' }
  }
  return {
    'board.name': board.name,
    'board.short_name': board.shortName,
    'board.chair.name': await boardChairName(db, board.id),
  }
}

export async function boardIdOf(db: DbOrTx, kind: BoardKind): Promise<string> {
  const board = await boardForKind(db, kind, new AbortController().signal)
  if (board === null) throw new AppError(ErrorIds.DB_INVARIANT, `no active ${kind} board`)
  return board.id
}

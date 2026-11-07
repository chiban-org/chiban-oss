import { BOARD_KINDS } from '@packs/nh/boardKinds'
import { BOARD_KIND_TRAITS, type BoardKind } from '@packs/nh/boardSchema'
import { and, eq, gte, isNull, or, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardMeetings, boardMemberships } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { allBoards, type BoardRow } from '@/features/boards/townBoards'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'

export interface BoardAdminRow {
  id: string
  name: string
  shortName: string
  kindText: string
  seated: number
  nextMeetingText: string | null
  active: boolean
}

export interface BoardKindOption {
  kind: BoardKind
  label: string
  description: string
  defaultShortName: string
  disabledReason: string | null
}

export interface BoardsAdminView {
  rows: BoardAdminRow[]
  kinds: BoardKindOption[]
}

function disabledReason(kind: BoardKind, boards: readonly BoardRow[]): string | null {
  const traits = BOARD_KIND_TRAITS[kind]
  const held = boards.some((b) => b.kind === kind && b.archivedAt === null)
  return traits.uniquePerTown && held
    ? `The town already has an active ${traits.label}. Archive it first to add another.`
    : null
}

async function seatedCounts(db: Db, today: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ boardId: boardMemberships.boardId, n: sql<number>`count(*)::int` })
    .from(boardMemberships)
    .where(
      and(
        sql`${boardMemberships.termStart} <= ${today}`,
        or(isNull(boardMemberships.termEnd), gte(boardMemberships.termEnd, today)),
      ),
    )
    .groupBy(boardMemberships.boardId)
  return new Map(rows.map((r) => [r.boardId, r.n]))
}

async function nextMeetings(db: Db, today: string): Promise<Map<string, string>> {
  const rows = await db
    .select({
      boardId: boardMeetings.boardId,
      next: sql<string>`min(${boardMeetings.meetingDate})`,
    })
    .from(boardMeetings)
    .where(and(eq(boardMeetings.status, 'scheduled'), gte(boardMeetings.meetingDate, today)))
    .groupBy(boardMeetings.boardId)
  return new Map(rows.map((r) => [r.boardId, r.next]))
}

export async function loadBoardsAdminView(
  db: Db,
  actor: Actor,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<BoardsAdminView | null> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'config.edit', signal))) return null
  const today = await townToday(db, now, signal)
  const boards = await allBoards(db)
  const [seated, next] = await Promise.all([seatedCounts(db, today), nextMeetings(db, today)])
  const rows = boards.map((b) => {
    const nextOn = next.get(b.id)
    return {
      id: b.id,
      name: b.name,
      shortName: b.shortName,
      kindText: BOARD_KIND_TRAITS[b.kind].label,
      seated: seated.get(b.id) ?? 0,
      nextMeetingText: nextOn === undefined ? null : formatCivilDate(nextOn),
      active: b.archivedAt === null,
    }
  })
  return {
    rows: [...rows.filter((r) => r.active), ...rows.filter((r) => !r.active)],
    kinds: BOARD_KINDS.map((kind) => ({
      kind,
      label: BOARD_KIND_TRAITS[kind].label,
      description: BOARD_KIND_TRAITS[kind].description,
      defaultShortName: BOARD_KIND_TRAITS[kind].defaultShortName,
      disabledReason: disabledReason(kind, boards),
    })),
  }
}

import { asc, eq, type SQL, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardMemberships as bm, users } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardLabel, getBoardSettings } from '@/features/boards/boardSettings'
import type { MemberTitle } from '@/features/boards/members'
import type { MemberSortKey, MemberTab } from '@/features/boards/membersParams'
import { type PageWindow, pageWindow } from '@/features/dataTable/pageSlice'
import type { SortState } from '@/features/dataTable/sort'
import { orderBySql } from '@/features/dataTable/sortSql'
import { formatCivilDate } from '@/lib/formatDate'

export interface MemberRow {
  membershipId: string
  name: string
  email: string
  board: 'planning_board' | 'zba'
  title: MemberTitle
  termStart: string
  termEnd: string | null
  boardName: string
  titleText: string
  termText: string
  statusText: string
  active: boolean
}

export interface MembersView extends PageWindow {
  rows: MemberRow[]
  counts: ReadonlyMap<MemberTab, number>
}

const TITLE_TEXT = {
  chair: 'Chair',
  vice_chair: 'Vice chair',
  member: 'Member',
  alternate: 'Alternate',
  clerk: 'Clerk',
} as const

const ROLE_ORDER = sql`case ${bm.title} when 'chair' then 0 when 'vice_chair' then 1 when 'member' then 2 when 'alternate' then 3 else 4 end`

function endedClause(today: string): SQL {
  return sql`(${bm.termEnd} is not null and ${bm.termEnd} < ${today})`
}

function sortColumns(today: string) {
  return {
    name: sql`lower(${users.displayName})`,
    email: sql`lower(${users.email})`,
    board: bm.board,
    role: ROLE_ORDER,
    term: bm.termStart,
    status: sql`case when ${bm.termStart} > ${today} then 1 else 0 end`,
  }
}

function statusText(m: typeof bm.$inferSelect, today: string): string {
  if (m.termEnd !== null && m.termEnd < today) return `Ended ${formatCivilDate(m.termEnd)}`
  if (m.termStart > today) return `Starts ${formatCivilDate(m.termStart)}`
  return 'Active'
}

function termText(m: typeof bm.$inferSelect): string {
  return m.termEnd === null
    ? `From ${formatCivilDate(m.termStart)}`
    : `${formatCivilDate(m.termStart)} to ${formatCivilDate(m.termEnd)}`
}

export async function loadMembersView(
  db: Db,
  actor: Actor,
  input: {
    today: string
    tab: MemberTab
    sort: SortState<MemberSortKey>
    limit: number
    offset: number
  },
  signal: AbortSignal,
): Promise<MembersView | null> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.manage_members', signal))) return null
  const settings = await getBoardSettings(db, signal)
  const ended = endedClause(input.today)
  const [rows, [tally]] = await Promise.all([
    db
      .select({ m: bm, name: users.displayName, email: users.email })
      .from(bm)
      .innerJoin(users, eq(users.id, bm.userId))
      .where(input.tab === 'ended' ? ended : sql`not ${ended}`)
      .orderBy(
        ...orderBySql(input.sort, sortColumns(input.today), [
          sql`lower(${users.displayName})`,
          asc(bm.id),
        ]),
      )
      .limit(input.limit)
      .offset(input.offset),
    db
      .select({
        ended: sql<number>`(count(*) filter (where ${ended}))::int`,
        all: sql<number>`count(*)::int`,
      })
      .from(bm),
  ])
  const endedCount = tally?.ended ?? 0
  const counts = new Map<MemberTab, number>([
    ['active', (tally?.all ?? 0) - endedCount],
    ['ended', endedCount],
  ])
  return {
    ...pageWindow(input.offset, input.limit, counts.get(input.tab) ?? 0),
    rows: rows.map(({ m, name, email }) => ({
      membershipId: m.id,
      name,
      email,
      board: m.board,
      title: m.title,
      termStart: m.termStart,
      termEnd: m.termEnd,
      boardName: boardLabel(settings, m.board),
      titleText: TITLE_TEXT[m.title],
      termText: termText(m),
      statusText: statusText(m, input.today),
      active: m.termStart <= input.today,
    })),
    counts,
  }
}

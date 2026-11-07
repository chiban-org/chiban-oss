import { desc, inArray, type SQL, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardMeetings as m } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import {
  AGENDA_STATES,
  type AgendaState,
  MEETING_KINDS,
  type MeetingFilters,
  type MeetingKind,
  type MeetingSortKey,
  type MeetingWhen,
} from '@/features/boards/meetingListParams'
import { anyOf, countFacets, type FacetCounts, facet, whereAll } from '@/features/dataTable/facets'
import type { SortState } from '@/features/dataTable/sort'
import { orderBySql } from '@/features/dataTable/sortSql'

export interface MeetingListRow {
  id: string
  boardId: string
  meetingDate: string
  kind: MeetingKind
  location: string
  cancelled: boolean
  cancelReason: string | null
  hearings: number
  agenda: AgendaState
  packetSent: boolean
}

export interface MeetingListPage {
  rows: MeetingListRow[]
  total: number
  offset: number
  prevOffset: number | null
  nextOffset: number | null
  counts: ReadonlyMap<MeetingWhen, number>
  facets: FacetCounts<MeetingGroup>
  usualLocation: string
}

type MeetingGroup = 'boards' | 'kinds' | 'agendas'

const HEARINGS = sql<number>`(select count(*)::int from hearings h where h.meeting_id = ${m}.id)`
const AGENDA = sql<AgendaState>`coalesce((select a.status from agendas a where a.meeting_id = ${m}.id), 'none')`

const SORT_COLUMNS = {
  date: m.meetingDate,
  board: sql`lower((select b.name from boards b where b.id = ${m.boardId}))`,
  kind: m.kind,
  location: sql`lower(${m.location})`,
  hearings: HEARINGS,
  agenda: sql`case ${AGENDA} when 'none' then 0 when 'draft' then 1 else 2 end`,
}

function whenClause(when: MeetingWhen, today: string): SQL {
  return when === 'upcoming' ? sql`${m.meetingDate} >= ${today}` : sql`${m.meetingDate} < ${today}`
}

function groupClauses(filters: MeetingFilters) {
  const boards = filters.boards ?? []
  const kinds = filters.kinds ?? []
  return new Map<MeetingGroup, SQL | undefined>([
    ['boards', boards.length === 0 ? undefined : inArray(m.boardId, boards)],
    ['kinds', kinds.length === 0 ? undefined : inArray(m.kind, kinds)],
    ['agendas', anyOf((filters.agendas ?? []).map((a) => sql`${AGENDA} = ${a}`))],
  ])
}

async function usualLocation(db: Db): Promise<string> {
  const [row] = await db
    .select({ location: m.location })
    .from(m)
    .groupBy(m.location)
    .orderBy(desc(sql`count(*)`), m.location)
    .limit(1)
  return row?.location ?? ''
}

async function tabCounts(db: Db, filters: MeetingFilters, today: string) {
  const where = whereAll([], groupClauses(filters))
  const [row] = await db
    .select({
      upcoming: sql<number>`(count(*) filter (where ${whenClause('upcoming', today)}))::int`,
      past: sql<number>`(count(*) filter (where ${whenClause('past', today)}))::int`,
    })
    .from(m)
    .where(where)
  return new Map<MeetingWhen, number>([
    ['upcoming', row?.upcoming ?? 0],
    ['past', row?.past ?? 0],
  ])
}

export async function listMeetingTable(
  db: Db,
  actor: Actor,
  input: {
    when: MeetingWhen
    today: string
    sort: SortState<MeetingSortKey>
    filters: MeetingFilters
    boardIds: readonly string[]
    limit: number
    offset: number
  },
  signal: AbortSignal,
): Promise<MeetingListPage | null> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return null
  const scope = whenClause(input.when, input.today)
  const groups = groupClauses(input.filters)
  const where = whereAll([scope], groups)
  const tiebreak = [
    sql`${m.meetingDate} ${input.when === 'past' ? sql`desc` : sql`asc`}`,
    sql`${m.id}`,
  ]
  const [found, [count], counts, facets, usual] = await Promise.all([
    db
      .select({
        id: m.id,
        boardId: m.boardId,
        meetingDate: m.meetingDate,
        kind: m.kind,
        location: m.location,
        status: m.status,
        cancelReason: m.cancelReason,
        hearings: HEARINGS,
        agenda: AGENDA,
        packetSent: sql<boolean>`exists (select 1 from board_packets bp
          where bp.meeting_id = ${m}.id and bp.sent_at is not null)`,
      })
      .from(m)
      .where(where)
      .orderBy(...orderBySql(input.sort, SORT_COLUMNS, tiebreak))
      .limit(input.limit + 1)
      .offset(input.offset),
    db.select({ n: sql<number>`count(*)::int` }).from(m).where(where),
    tabCounts(db, input.filters, input.today),
    countFacets(db, {
      table: m,
      scope,
      others: (group) => whereAll([], groups, group),
      facets: [
        facet('boards', input.boardIds, (b) => sql`${m.boardId} = ${b}`),
        facet('kinds', MEETING_KINDS, (k) => sql`${m.kind} = ${k}`),
        facet('agendas', AGENDA_STATES, (a) => sql`${AGENDA} = ${a}`),
      ],
    }),
    usualLocation(db),
  ])
  return {
    rows: found.slice(0, input.limit).map(({ status, ...r }) => ({
      ...r,
      cancelled: status === 'cancelled',
    })),
    total: count?.n ?? 0,
    offset: input.offset,
    prevOffset: input.offset === 0 ? null : Math.max(0, input.offset - input.limit),
    nextOffset: found.length > input.limit ? input.offset + input.limit : null,
    counts,
    facets,
    usualLocation: usual,
  }
}

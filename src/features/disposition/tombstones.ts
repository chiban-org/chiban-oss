import { inArray, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { dispositionTombstones as t } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { anyOf, countFacets, facet, whereAll } from '@/features/dataTable/facets'
import type { FilterOption } from '@/features/dataTable/quickFilters'
import { defaultSort, type SortState } from '@/features/dataTable/sort'
import { orderBySql } from '@/features/dataTable/sortSql'
import { seriesLabelSql } from '@/features/disposition/seriesLabelSql'
import {
  TOMBSTONE_KINDS,
  TOMBSTONE_SORT,
  TOMBSTONE_WINDOWS,
  type TombstoneFilters,
  type TombstoneSortKey,
  type TombstoneWindow,
} from '@/features/disposition/tombstoneParams'
import { findSeries } from '@/features/records/series'
import { err, ok, type Result } from '@/types/result'

const MAX_LIMIT = 200
const RECENT_DAYS = 30

export interface TombstoneRow {
  id: string
  batchId: string
  recordKind: 'document' | 'application_snapshot'
  title: string
  seriesLabel: string
  citation: { label: string; url: string | null }
  executedAt: Date
  proposedBy: string
  approvedBy: string
}

export interface TombstonePage {
  rows: TombstoneRow[]
  total: number
  offset: number
  prevOffset: number | null
  nextOffset: number | null
}

type TombstoneGroup = 'kinds' | 'windows' | 'series'

const SORT_COLUMNS = {
  record: t.title,
  kind: t.recordKind,
  series: seriesLabelSql(t.seriesKey),
  disposed: t.executedAt,
}

const TIEBREAK: readonly SQL[] = [sql`${t.executedAt} desc`, sql`${t.id} desc`]

function windowClause(window: TombstoneWindow, now: Date): SQL {
  const cutoff = new Date(now.getTime() - RECENT_DAYS * 86_400_000).toISOString()
  return window === 'recent'
    ? sql`${t.executedAt} >= ${cutoff}::timestamptz`
    : sql`${t.executedAt} < ${cutoff}::timestamptz`
}

function groupClauses(filters: TombstoneFilters, now: Date) {
  const kinds = filters.kinds ?? []
  const series = filters.seriesKeys ?? []
  return new Map<TombstoneGroup, SQL | undefined>([
    ['kinds', kinds.length === 0 ? undefined : inArray(t.recordKind, kinds)],
    ['windows', anyOf((filters.windows ?? []).map((w) => windowClause(w, now)))],
    ['series', series.length === 0 ? undefined : inArray(t.seriesKey, series)],
  ])
}

async function mayView(db: DbOrTx, actor: Actor, signal: AbortSignal): Promise<boolean> {
  return (
    (await hasCapability(db, actor.userId, 'disposition.approve', signal)) ||
    (await hasCapability(db, actor.userId, 'disposition.propose', signal))
  )
}

export async function listTombstones(
  db: DbOrTx,
  actor: Actor,
  input: {
    limit: number
    offset?: number
    sort?: SortState<TombstoneSortKey>
    filters?: TombstoneFilters
    now?: Date
  },
  signal: AbortSignal,
): Promise<Result<TombstonePage, 'forbidden'>> {
  signal.throwIfAborted()
  if (!(await mayView(db, actor, signal))) return err('forbidden')
  const limit = Math.min(Math.max(Math.trunc(input.limit), 1), MAX_LIMIT)
  const offset = input.offset ?? 0
  const where = whereAll([], groupClauses(input.filters ?? {}, input.now ?? new Date()))
  const sort = input.sort ?? defaultSort(TOMBSTONE_SORT)
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(t).where(where)
  const found = await db
    .select()
    .from(t)
    .where(where)
    .orderBy(...orderBySql(sort, SORT_COLUMNS, TIEBREAK))
    .limit(limit + 1)
    .offset(offset)
  const rows: TombstoneRow[] = found.slice(0, limit).map((r) => ({
    id: r.id,
    batchId: r.batchId,
    recordKind: r.recordKind,
    title: r.title,
    seriesLabel: findSeries(r.seriesKey)?.label ?? r.seriesKey,
    citation: r.seriesCitation,
    executedAt: r.executedAt,
    proposedBy: r.proposedBy,
    approvedBy: r.approvedBy,
  }))
  return ok({
    rows,
    total: count?.n ?? 0,
    offset,
    prevOffset: offset === 0 ? null : Math.max(0, offset - limit),
    nextOffset: found.length > limit ? offset + limit : null,
  })
}

export interface TombstoneFacets {
  kinds: ReadonlyMap<string, number>
  windows: ReadonlyMap<string, number>
  series: FilterOption[]
}

export async function tombstoneFacets(
  db: DbOrTx,
  input: { filters: TombstoneFilters; now?: Date },
  signal: AbortSignal,
): Promise<TombstoneFacets> {
  signal.throwIfAborted()
  const now = input.now ?? new Date()
  const others = (group: TombstoneGroup) => whereAll([], groupClauses(input.filters, now), group)
  const counts = await countFacets(db, {
    table: t,
    scope: sql`true`,
    others,
    facets: [
      facet('kinds', TOMBSTONE_KINDS, (kind) => sql`${t.recordKind} = ${kind}`),
      facet('windows', TOMBSTONE_WINDOWS, (w) => windowClause(w, now)),
    ],
  })
  const rows = await db
    .select({
      key: t.seriesKey,
      count: sql<number>`(count(*) filter (where ${others('series')}))::int`,
    })
    .from(t)
    .groupBy(t.seriesKey)
  const series = rows
    .map((row) => ({
      value: row.key,
      label: findSeries(row.key)?.label ?? row.key,
      count: row.count,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
  return {
    kinds: counts.get('kinds') ?? new Map(),
    windows: counts.get('windows') ?? new Map(),
    series,
  }
}

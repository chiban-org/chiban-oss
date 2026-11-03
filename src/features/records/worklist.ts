import type { RecordSeries } from '@packs/nh/schema'
import { type SQL, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import type { SortConfig, SortState } from '@/features/dataTable/sort'
import { orderBySql } from '@/features/dataTable/sortSql'
import type { RetentionStatus } from '@/features/records/computeRetention'
import { requireSeries } from '@/features/records/series'
import { staffRecordHref } from '@/features/records/staffRecordLinks'
import { classifiedRecords } from '@/features/records/worklistSql'
import { getTownSettings } from '@/features/town/settings'
import type { CivilDate } from '@/types/civilDate'

export const WORKLIST_STATES = ['eligible', 'awaiting_event', 'on_hold'] as const
export type WorklistState = (typeof WORKLIST_STATES)[number]

export type WorklistSortKey = 'record' | 'kind' | 'series' | 'eligible'

export const WORKLIST_SORT: SortConfig<WorklistSortKey> = {
  defaultKey: 'eligible',
  columns: { record: 'asc', kind: 'asc', series: 'asc', eligible: 'asc' },
}

export interface EventTarget {
  kind: 'case' | 'project'
  id: string
}

export interface WorklistRow {
  ref: { kind: 'document' | 'application_snapshot'; id: string }
  title: string
  owner: string | null
  href: string | null
  eventTarget: EventTarget | null
  series: { key: string; label: string; citation: RecordSeries['citation'] }
  status: RetentionStatus
  holds: number
}

export interface WorklistPage {
  rows: WorklistRow[]
  counts: ReadonlyMap<WorklistState, number>
  total: number
  offset: number
  prevOffset: number | null
  nextOffset: number | null
}

interface RawRow extends Record<string, unknown> {
  kind: 'document' | 'application_snapshot'
  id: string
  series_key: string
  title: string | null
  owner_label: string | null
  link_kind: string | null
  link_id: string | null
  event_kind: 'case' | 'project' | null
  event_id: string | null
  eligible_on: string | null
  holds: number
}

const FALLBACK_ZONE = 'America/New_York'
const MAX_LIMIT = 200

const SORT_COLUMNS: Record<WorklistSortKey, SQL> = {
  record: sql`lower(title)`,
  kind: sql`kind`,
  series: sql`lower(series_label)`,
  eligible: sql`eligible_on`,
}
const TIEBREAK = [sql`lower(title) asc`, sql`kind asc`, sql`id asc`]

const EMPTY: WorklistPage = {
  rows: [],
  counts: new Map(),
  total: 0,
  offset: 0,
  prevOffset: null,
  nextOffset: null,
}

function toRow(raw: RawRow): WorklistRow {
  const series = requireSeries(raw.series_key)
  const awaiting = series.retention.kind === 'event' ? series.retention.events : []
  return {
    ref: { kind: raw.kind, id: raw.id },
    title: raw.title ?? raw.id,
    owner: raw.owner_label,
    href: staffRecordHref(raw.link_kind, raw.link_id),
    eventTarget:
      raw.event_kind === null || raw.event_id === null
        ? null
        : { kind: raw.event_kind, id: raw.event_id },
    series: { key: series.key, label: series.label, citation: series.citation },
    status:
      raw.eligible_on === null
        ? { state: 'not_yet_triggered', awaiting }
        : { state: 'eligible_on', date: raw.eligible_on as CivilDate },
    holds: raw.holds,
  }
}

async function mayView(db: Db, actor: Actor, signal: AbortSignal): Promise<boolean> {
  return (
    (await hasCapability(db, actor.userId, 'disposition.approve', signal)) ||
    (await hasCapability(db, actor.userId, 'disposition.propose', signal))
  )
}

export async function retentionWorklist(
  db: Db,
  actor: Actor,
  input: {
    asOf: CivilDate
    state: WorklistState
    limit: number
    offset?: number
    sort?: SortState<WorklistSortKey>
  },
  signal: AbortSignal,
): Promise<WorklistPage> {
  signal.throwIfAborted()
  if (!(await mayView(db, actor, signal))) return EMPTY
  const town = await getTownSettings(db, signal)
  const classified = classifiedRecords(input.asOf, town.ok ? town.value.timeZone : FALLBACK_ZONE)
  if (classified === null) return EMPTY
  const limit = Math.min(Math.max(Math.trunc(input.limit), 1), MAX_LIMIT)
  const offset = Math.max(Math.trunc(input.offset ?? 0), 0)
  const sort = input.sort ?? { key: WORKLIST_SORT.defaultKey, dir: 'asc' }
  const [tally, page] = await Promise.all([
    db.execute<{ state: WorklistState; n: number }>(
      sql`${classified} select state, count(*)::int as n from classified where state is not null group by state`,
    ),
    db.execute<RawRow>(sql`${classified}
      select kind, id::text as id, series_key, title, owner_label, link_kind, link_id,
        event_kind, event_id, eligible_on::text as eligible_on, holds
      from classified where state = ${input.state}
      order by ${sql.join(orderBySql(sort, SORT_COLUMNS, TIEBREAK), sql`, `)}
      limit ${limit} offset ${offset}`),
  ])
  const counts = new Map(tally.rows.map((r) => [r.state, r.n]))
  const total = counts.get(input.state) ?? 0
  return {
    rows: page.rows.map(toRow),
    counts,
    total,
    offset,
    prevOffset: offset === 0 ? null : Math.max(0, offset - limit),
    nextOffset: offset + limit < total ? offset + limit : null,
  }
}

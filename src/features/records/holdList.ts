import { desc, isNotNull, isNull, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { legalHolds } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { type PageWindow, pageWindow } from '@/features/dataTable/pageSlice'
import {
  type RawSearchParams,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'
import { orderBySql } from '@/features/dataTable/sortSql'
import { staffRecordHref } from '@/features/records/staffRecordLinks'
import { err, ok, type Result } from '@/types/result'

export const HOLDS_PATH = '/staff/records/holds'

export const HOLD_STATES = ['active', 'released'] as const
export type HoldState = (typeof HOLD_STATES)[number]

export type HoldSortKey = 'subject' | 'kind' | 'reason' | 'placed'

export const HOLD_SORT: SortConfig<HoldSortKey> = {
  defaultKey: 'placed',
  columns: { subject: 'asc', kind: 'asc', reason: 'asc', placed: 'desc' },
}

export interface HoldView {
  params: TableParams
  state: HoldState
  sort: SortState<HoldSortKey>
}

export function readHoldView(raw: RawSearchParams): HoldView {
  const params = readTableParams(raw)
  const chosen = params.get('state')?.[0]
  return {
    params,
    state: chosen === 'released' ? 'released' : 'active',
    sort: parseSort(HOLD_SORT, params),
  }
}

const target = sql`${legalHolds.targetId}`

const SUBJECT = sql<string>`coalesce(case ${legalHolds.targetKind}
  when 'application' then (select a.number from applications a where a.id = ${target})
  when 'project' then (select p.title from projects p where p.id = ${target})
  when 'document' then (select d.title from documents d where d.id = ${target})
  when 'enforcement_case' then (select c.number from enforcement_cases c where c.id = ${target})
  when 'rtk_request' then (select r.number from rtk_requests r where r.id = ${target})
end, '')`

const LINK_KIND = sql<string | null>`case ${legalHolds.targetKind}
  when 'project' then 'parcel'
  when 'document' then (select case when d.record_kind = 'project' then 'parcel' else d.record_kind end
    from documents d where d.id = ${target})
  else ${legalHolds.targetKind} end`

const LINK_ID = sql<string | null>`case ${legalHolds.targetKind}
  when 'project' then (select p.parcel_id::text from projects p where p.id = ${target})
  when 'document' then (select case when d.record_kind = 'project'
      then (select p.parcel_id::text from projects p where p.id = d.record_id)
      else d.record_id::text end
    from documents d where d.id = ${target})
  else ${target}::text end`

const SORT_COLUMNS = {
  subject: sql`lower(${SUBJECT})`,
  kind: legalHolds.targetKind,
  reason: sql`lower(${legalHolds.reason})`,
  placed: legalHolds.placedAt,
}

export interface HoldListRow {
  id: string
  targetKind: (typeof legalHolds.$inferSelect)['targetKind']
  subject: string
  href: string | null
  reason: string
  placedAt: Date
  releasedAt: Date | null
  releaseReason: string | null
}

export interface HoldList extends PageWindow {
  rows: HoldListRow[]
  counts: ReadonlyMap<HoldState, number>
}

export async function listHoldTable(
  db: DbOrTx,
  actor: Actor,
  input: { state: HoldState; sort: SortState<HoldSortKey>; limit: number; offset: number },
  signal: AbortSignal,
): Promise<Result<HoldList, 'forbidden'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'hold.place_release', signal)
  if (!allowed.ok) return err('forbidden')
  const [rows, [tally]] = await Promise.all([
    db
      .select({
        id: legalHolds.id,
        targetKind: legalHolds.targetKind,
        subject: SUBJECT,
        linkKind: LINK_KIND,
        linkId: LINK_ID,
        reason: legalHolds.reason,
        placedAt: legalHolds.placedAt,
        releasedAt: legalHolds.releasedAt,
        releaseReason: legalHolds.releaseReason,
      })
      .from(legalHolds)
      .where(
        input.state === 'active' ? isNull(legalHolds.releasedAt) : isNotNull(legalHolds.releasedAt),
      )
      .orderBy(...orderBySql(input.sort, SORT_COLUMNS, [desc(legalHolds.id)]))
      .limit(input.limit)
      .offset(input.offset),
    db
      .select({
        active: sql<number>`(count(*) filter (where ${legalHolds.releasedAt} is null))::int`,
        released: sql<number>`(count(*) filter (where ${legalHolds.releasedAt} is not null))::int`,
      })
      .from(legalHolds),
  ])
  const counts = new Map<HoldState, number>([
    ['active', tally?.active ?? 0],
    ['released', tally?.released ?? 0],
  ])
  return ok({
    ...pageWindow(input.offset, input.limit, counts.get(input.state) ?? 0),
    rows: rows.map(({ linkKind, linkId, ...row }) => ({
      ...row,
      href: staffRecordHref(linkKind, linkId),
    })),
    counts,
  })
}

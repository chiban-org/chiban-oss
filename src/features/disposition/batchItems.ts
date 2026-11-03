import { eq, inArray, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { dispositionTombstones, documents, dispositionItems as items } from '@/db/schema'
import { anyOf, countFacets, facet, whereAll } from '@/features/dataTable/facets'
import type { FilterOption } from '@/features/dataTable/quickFilters'
import type { SortState } from '@/features/dataTable/sort'
import { orderBySql } from '@/features/dataTable/sortSql'
import {
  BATCH_ITEM_KINDS,
  BATCH_ITEM_RESULTS,
  type BatchItemFilters,
  type BatchItemResult,
  type BatchItemSortKey,
} from '@/features/disposition/batchItemParams'
import { seriesLabelSql } from '@/features/disposition/seriesLabelSql'
import { findSeries } from '@/features/records/series'

type ItemGroup = 'kinds' | 'results' | 'series'

const RECORD_TITLE = sql`coalesce(${dispositionTombstones.title}, ${documents.title}, 'Application snapshot')`

const SORT_COLUMNS = {
  record: RECORD_TITLE,
  kind: items.recordKind,
  series: seriesLabelSql(items.seriesKey),
  eligible: items.eligibleOn,
  result: items.outcome,
}

const TIEBREAK: readonly SQL[] = [sql`${items.recordKind} asc`, sql`${items.recordId} asc`]

function resultClause(result: BatchItemResult): SQL {
  return result === 'pending' ? sql`${items.outcome} is null` : sql`${items.outcome} = ${result}`
}

function groupClauses(filters: BatchItemFilters) {
  const kinds = filters.kinds ?? []
  const series = filters.seriesKeys ?? []
  return new Map<ItemGroup, SQL | undefined>([
    ['kinds', kinds.length === 0 ? undefined : inArray(items.recordKind, kinds)],
    ['results', anyOf((filters.results ?? []).map(resultClause))],
    ['series', series.length === 0 ? undefined : inArray(items.seriesKey, series)],
  ])
}

export async function listBatchItems(
  db: DbOrTx,
  batchId: string,
  input: { sort: SortState<BatchItemSortKey>; filters: BatchItemFilters },
) {
  return await db
    .select({
      kind: items.recordKind,
      recordId: items.recordId,
      seriesKey: items.seriesKey,
      eligibleOn: items.eligibleOn,
      outcome: items.outcome,
      title: dispositionTombstones.title,
      documentTitle: documents.title,
      citation: dispositionTombstones.seriesCitation,
    })
    .from(items)
    .leftJoin(dispositionTombstones, eq(dispositionTombstones.recordId, items.recordId))
    .leftJoin(documents, eq(documents.id, items.recordId))
    .where(whereAll([eq(items.batchId, batchId)], groupClauses(input.filters)))
    .orderBy(...orderBySql(input.sort, SORT_COLUMNS, TIEBREAK))
}

export interface BatchItemFacets {
  kinds: ReadonlyMap<string, number>
  results: ReadonlyMap<string, number>
  series: FilterOption[]
}

export async function batchItemFacets(
  db: DbOrTx,
  batchId: string,
  input: { filters: BatchItemFilters },
): Promise<BatchItemFacets> {
  const scope = eq(items.batchId, batchId)
  const others = (group: ItemGroup) => whereAll([scope], groupClauses(input.filters), group)
  const counts = await countFacets(db, {
    table: items,
    scope,
    others,
    facets: [
      facet('kinds', BATCH_ITEM_KINDS, (kind) => eq(items.recordKind, kind)),
      facet('results', BATCH_ITEM_RESULTS, resultClause),
    ],
  })
  const rows = await db
    .select({
      key: items.seriesKey,
      count: sql<number>`(count(*) filter (where ${others('series')}))::int`,
    })
    .from(items)
    .where(scope)
    .groupBy(items.seriesKey)
  return {
    kinds: counts.get('kinds') ?? new Map(),
    results: counts.get('results') ?? new Map(),
    series: rows
      .map((row) => ({
        value: row.key,
        label: findSeries(row.key)?.label ?? row.key,
        count: row.count,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  }
}

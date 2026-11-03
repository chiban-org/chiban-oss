import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dispositionBatches, dispositionItems, dispositionTombstones } from '@/db/schema'
import type { BatchItemFilters, BatchItemSortKey } from '@/features/disposition/batchItemParams'
import { batchItemFacets, listBatchItems } from '@/features/disposition/batchItems'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

let handle: TestDb
let batchId = ''
const record: Record<string, string> = {}

type Item = {
  name: string
  kind: 'document' | 'application_snapshot'
  series: string
  eligibleOn: string
  outcome: 'disposed' | 'skipped_hold' | 'skipped_not_eligible' | null
  title: string | null
}

const ITEMS: Item[] = [
  {
    name: 'a',
    kind: 'document',
    series: 'nh.rs.driveway_permits',
    eligibleOn: '2027-01-05',
    outcome: 'disposed',
    title: 'Zeta',
  },
  {
    name: 'b',
    kind: 'document',
    series: 'nh.rs.septic_plans',
    eligibleOn: '2026-12-01',
    outcome: null,
    title: 'Alpha',
  },
  {
    name: 'c',
    kind: 'application_snapshot',
    series: 'nh.rs.driveway_permits',
    eligibleOn: '2027-01-05',
    outcome: 'skipped_hold',
    title: null,
  },
  {
    name: 'd',
    kind: 'document',
    series: 'nh.rs.complaint_log',
    eligibleOn: '2027-02-01',
    outcome: 'skipped_not_eligible',
    title: 'Mid',
  },
]

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  const custodian = await staffActor(handle.db, 'records_custodian')
  const [batch] = await handle.db
    .insert(dispositionBatches)
    .values({ asOf: '2027-03-01', proposedBy: custodian.userId })
    .returning({ id: dispositionBatches.id })
  batchId = batch?.id ?? ''
  for (const item of ITEMS) {
    const recordId = crypto.randomUUID()
    record[item.name] = recordId
    await handle.db.insert(dispositionItems).values({
      batchId,
      recordKind: item.kind,
      recordId,
      seriesKey: item.series,
      seriesVersion: '1',
      eligibleOn: item.eligibleOn,
      outcome: item.outcome,
    })
    if (item.title !== null) {
      await handle.db.insert(dispositionTombstones).values({
        batchId,
        recordKind: item.kind,
        recordId,
        title: item.title,
        seriesKey: item.series,
        seriesVersion: '1',
        seriesCitation: { label: 'RSA', url: null },
        retentionBasis: { state: 'closed', eligibleOn: null, events: [] },
        versionIds: [],
        fileSha256s: [],
        proposedBy: custodian.userId,
        approvedBy: custodian.userId,
      })
    }
  }
})
afterAll(async () => {
  await handle.drop()
})

async function names(
  key: BatchItemSortKey,
  dir: 'asc' | 'desc' = 'asc',
  filters: BatchItemFilters = {},
) {
  const rows = await listBatchItems(handle.db, batchId, { sort: { key, dir }, filters })
  const byId = new Map(Object.entries(record).map(([name, id]) => [id, name]))
  return rows.map((r) => byId.get(r.recordId))
}

describe('disposition batch item sorting', () => {
  it('keeps kind then record id as the default order', async () => {
    const order = await names('kind')
    expect(order[0]).toBe('c')
    const documents = order.slice(1)
    const ids = documents.map((n) => record[n ?? ''] ?? '')
    expect(ids).toEqual([...ids].sort())
  })

  it('sorts by record title with the untitled snapshot falling back to its default name', async () => {
    expect(await names('record')).toEqual(['b', 'c', 'd', 'a'])
    expect(await names('record', 'desc')).toEqual(['a', 'd', 'c', 'b'])
  })

  it('sorts by eligible date with ties broken by kind then record id', async () => {
    const order = await names('eligible')
    expect(order.slice(0, 1)).toEqual(['b'])
    expect(order.at(-1)).toBe('d')
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('a'))
  })

  it('sorts by result with the not yet carried out items last in both directions', async () => {
    expect((await names('result')).at(-1)).toBe('b')
    expect((await names('result', 'desc')).at(-1)).toBe('b')
    expect((await names('result')).slice(0, 1)).toEqual(['a'])
  })

  it('sorts by series label', async () => {
    const order = await names('series')
    expect(order[0]).toBe('d')
    expect(order.at(-1)).toBe('b')
  })
})

describe('disposition batch item quick filters', () => {
  it('filters by result, including the items not yet carried out', async () => {
    expect(await names('record', 'asc', { results: ['pending'] })).toEqual(['b'])
    expect(
      (await names('record', 'asc', { results: ['disposed', 'skipped_hold'] })).sort(),
    ).toEqual(['a', 'c'])
  })

  it('filters by kind and by series, ANDed across groups', async () => {
    expect(await names('record', 'asc', { kinds: ['application_snapshot'] })).toEqual(['c'])
    expect(
      (await names('record', 'asc', { seriesKeys: ['nh.rs.driveway_permits'] })).sort(),
    ).toEqual(['a', 'c'])
    expect(
      await names('record', 'asc', {
        kinds: ['document'],
        seriesKeys: ['nh.rs.driveway_permits'],
      }),
    ).toEqual(['a'])
  })

  it('counts every chip against the other groups', async () => {
    const facets = await batchItemFacets(handle.db, batchId, {
      filters: { kinds: ['document'] },
    })
    expect(Object.fromEntries(facets.kinds)).toEqual({ document: 3, application_snapshot: 1 })
    expect(Object.fromEntries(facets.results)).toEqual({
      disposed: 1,
      skipped_hold: 0,
      skipped_not_eligible: 1,
      pending: 1,
    })
    expect(facets.series.map((s) => [s.value, s.count])).toEqual([
      ['nh.rs.complaint_log', 1],
      ['nh.rs.driveway_permits', 1],
      ['nh.rs.septic_plans', 1],
    ])
  })
})

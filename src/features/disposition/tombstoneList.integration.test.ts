import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dispositionBatches, dispositionTombstones } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import type { TombstoneFilters, TombstoneSortKey } from '@/features/disposition/tombstoneParams'
import { listTombstones, tombstoneFacets } from '@/features/disposition/tombstones'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T15:00:00Z')
const CITATION = { label: 'RSA 33-A:3-a', url: null }
let handle: TestDb
let custodian: Actor
let ids: Record<string, string> = {}

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  custodian = await staffActor(handle.db, 'records_custodian')
  const [batch] = await handle.db
    .insert(dispositionBatches)
    .values({ asOf: '2027-03-01', proposedBy: custodian.userId })
    .returning({ id: dispositionBatches.id })
  const batchId = batch?.id ?? ''
  const make = async (
    title: string,
    recordKind: 'document' | 'application_snapshot',
    seriesKey: string,
    executedAt: string,
  ) => {
    const [row] = await handle.db
      .insert(dispositionTombstones)
      .values({
        batchId,
        recordKind,
        recordId: crypto.randomUUID(),
        title,
        seriesKey,
        seriesVersion: '1',
        seriesCitation: CITATION,
        retentionBasis: { state: 'closed', eligibleOn: null, events: [] },
        versionIds: [],
        fileSha256s: [],
        proposedBy: custodian.userId,
        approvedBy: custodian.userId,
        executedAt: new Date(executedAt),
      })
      .returning({ id: dispositionTombstones.id })
    return row?.id ?? ''
  }
  ids = {
    apple: await make('Apple', 'document', 'nh.rs.driveway_permits', '2027-02-20T12:00:00Z'),
    banana: await make(
      'Banana',
      'application_snapshot',
      'nh.rs.septic_plans',
      '2027-02-25T12:00:00Z',
    ),
    cherry: await make('cherry', 'document', 'nh.rs.complaint_log', '2026-11-01T12:00:00Z'),
    tie: await make('Apple', 'document', 'nh.rs.driveway_permits', '2027-02-20T12:00:00Z'),
  }
})
afterAll(async () => {
  await handle.drop()
})

async function titles(options: {
  sort?: { key: TombstoneSortKey; dir: 'asc' | 'desc' }
  filters?: TombstoneFilters
  limit?: number
  offset?: number
}) {
  const result = await listTombstones(
    handle.db,
    custodian,
    { limit: options.limit ?? 25, ...options, now: NOW },
    signal,
  )
  if (!result.ok) throw new Error(result.error)
  return result.value
}

const idList = async (options: Parameters<typeof titles>[0]) =>
  (await titles(options)).rows.map((r) => r.id)

describe('disposed records sorting', () => {
  it('opens newest first with the later row id first inside a tie', async () => {
    const order = await idList({})
    expect(order.slice(0, 1)).toEqual([ids.banana])
    expect(order.at(-1)).toBe(ids.cherry)
  })

  it('sorts by record title, case-insensitively by collation of the database', async () => {
    const rows = (await titles({ sort: { key: 'record', dir: 'asc' } })).rows
    expect(rows.map((r) => r.title.toLowerCase())).toEqual(['apple', 'apple', 'banana', 'cherry'])
    expect((rows[0]?.id ?? '') > (rows[1]?.id ?? '')).toBe(true)
  })

  it('sorts by kind and then by the series label, with the newest first inside a tie', async () => {
    const byKind = await idList({ sort: { key: 'kind', dir: 'asc' } })
    expect(byKind[0]).toBe(ids.banana)
    const bySeries = (await titles({ sort: { key: 'series', dir: 'asc' } })).rows
    expect(bySeries.map((r) => r.seriesLabel)).toEqual([
      'Complaints: until the appeal period has expired',
      'Driveway permits',
      'Driveway permits',
      'Septic plans: until replaced or removed',
    ])
  })

  it('sorts oldest first when asked', async () => {
    expect((await idList({ sort: { key: 'disposed', dir: 'asc' } }))[0]).toBe(ids.cherry)
  })
})

describe('disposed records quick filters', () => {
  it('filters by kind', async () => {
    expect(await idList({ filters: { kinds: ['application_snapshot'] } })).toEqual([ids.banana])
  })

  it('filters by how long ago the record was disposed of', async () => {
    expect(await idList({ filters: { windows: ['older'] } })).toEqual([ids.cherry])
    expect((await idList({ filters: { windows: ['recent'] } })).length).toBe(3)
  })

  it('filters by series and ORs values inside a group', async () => {
    const one = await idList({ filters: { seriesKeys: ['nh.rs.septic_plans'] } })
    expect(one).toEqual([ids.banana])
    const two = await idList({
      filters: { seriesKeys: ['nh.rs.septic_plans', 'nh.rs.complaint_log'] },
    })
    expect(new Set(two)).toEqual(new Set([ids.banana, ids.cherry]))
  })

  it('pages with an offset and reports the total', async () => {
    const page = await titles({ limit: 3 })
    expect(page).toMatchObject({ total: 4, nextOffset: 3, prevOffset: null })
    const next = await titles({ limit: 3, offset: 3 })
    expect(next).toMatchObject({
      rows: expect.any(Array) as unknown,
      nextOffset: null,
      prevOffset: 0,
    })
    expect(next.rows).toHaveLength(1)
  })

  it('counts each chip against the other groups', async () => {
    const facets = await tombstoneFacets(
      handle.db,
      { filters: { kinds: ['document'] }, now: NOW },
      signal,
    )
    expect(Object.fromEntries(facets.kinds)).toEqual({ document: 3, application_snapshot: 1 })
    expect(Object.fromEntries(facets.windows)).toEqual({ recent: 2, older: 1 })
    expect(facets.series.map((s) => [s.value, s.count])).toEqual([
      ['nh.rs.complaint_log', 1],
      ['nh.rs.driveway_permits', 2],
      ['nh.rs.septic_plans', 0],
    ])
  })
})

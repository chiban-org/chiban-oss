import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { importRuns } from '@/db/schema'
import { listRecentRuns, RECENT_RUN_LIMIT, readRunView } from '@/features/gis/import/runSort'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb
const names = new Map<string, string>()

const RUNS = [
  ['a', '2027-01-02T00:00:00Z', 'roads', 'file_shapefile', 'failed'],
  ['b', '2027-01-03T00:00:00Z', 'cama', 'file_cama_csv', 'succeeded'],
  ['c', '2027-01-01T00:00:00Z', 'parcels', 'axisgis', 'succeeded'],
  ['d', '2027-01-04T00:00:00Z', 'parcels', 'esri_rest', 'running'],
] as const

beforeAll(async () => {
  handle = await makeTestDb()
  for (const [name, startedAt, layerKey, adapter, status] of RUNS) {
    const [row] = await handle.db
      .insert(importRuns)
      .values({ layerKey, adapter, status, inputHash: name, startedAt: new Date(startedAt) })
      .returning({ id: importRuns.id })
    names.set(row?.id ?? '', name)
  }
})
afterAll(async () => {
  await handle.drop()
})

async function order(raw: Record<string, string>) {
  const rows = await listRecentRuns(handle.db, readRunView(raw).sort, signal)
  return rows.map((r) => names.get(r.id))
}

describe('recent import runs', () => {
  it('opens newest first', async () => {
    expect(readRunView({}).sort).toEqual({ key: 'started', dir: 'desc' })
    expect(await order({})).toEqual(['d', 'b', 'a', 'c'])
    expect(await order({ sort: 'started', dir: 'asc' })).toEqual(['c', 'a', 'b', 'd'])
  })

  it('sorts by the layer name shown, newest first inside a tie', async () => {
    expect(await order({ sort: 'layer' })).toEqual(['b', 'd', 'c', 'a'])
  })

  it('sorts by the source name shown rather than its key', async () => {
    expect(await order({ sort: 'source' })).toEqual(['c', 'b', 'd', 'a'])
  })

  it('sorts by status', async () => {
    expect(await order({ sort: 'status' })).toEqual(['a', 'd', 'b', 'c'])
  })

  it('sorts every run before taking the first page', async () => {
    const values = Array.from({ length: RECENT_RUN_LIMIT }, (_, i) => ({
      layerKey: 'water' as const,
      adapter: 'file_geojson',
      status: 'succeeded' as const,
      inputHash: `w${i}`,
      startedAt: new Date(Date.UTC(2027, 1, 1, i)),
    }))
    await handle.db.insert(importRuns).values(values)
    const rows = await listRecentRuns(handle.db, { key: 'layer', dir: 'asc' }, signal)
    expect(rows).toHaveLength(RECENT_RUN_LIMIT)
    expect(rows.slice(0, 4).map((r) => names.get(r.id))).toEqual(['b', 'd', 'c', 'a'])
  })
})

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { importExceptions, importRuns } from '@/db/schema'
import type { ExceptionSortKey } from '@/features/gis/exceptionSort'
import { listExceptions } from '@/features/gis/exceptionsList'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb
const ids: Record<string, string> = {}

beforeAll(async () => {
  handle = await makeTestDb()
  const [run] = await handle.db
    .insert(importRuns)
    .values({ layerKey: 'parcels', adapter: 'file_geojson', inputHash: 'h', status: 'succeeded' })
    .returning({ id: importRuns.id })
  const runId = run?.id ?? ''
  const make = async (
    name: string,
    kind: 'invalid_geometry' | 'owner_changed' | 'alias_conflict',
    rowKey: string,
    createdAt: string,
  ) => {
    const [row] = await handle.db
      .insert(importExceptions)
      .values({
        layerKey: 'parcels',
        firstRunId: runId,
        lastSeenRunId: runId,
        rowKey,
        kind,
        contentHash: name,
        payload: {},
        detail: name,
        createdAt: new Date(createdAt),
      })
      .returning({ id: importExceptions.id })
    ids[name] = row?.id ?? ''
  }
  await make('a', 'owner_changed', 'id:3', '2027-01-02T00:00:00Z')
  await make('b', 'invalid_geometry', 'id:1', '2027-01-03T00:00:00Z')
  await make('c', 'alias_conflict', 'id:2', '2027-01-01T00:00:00Z')
  await make('d', 'owner_changed', 'id:3', '2027-01-04T00:00:00Z')
})
afterAll(async () => {
  await handle.drop()
})

async function order(key: ExceptionSortKey | null, dir: 'asc' | 'desc' = 'asc') {
  const rows = await listExceptions(
    handle.db,
    { status: 'open', ...(key === null ? {} : { sort: { key, dir } }) },
    signal,
  )
  const byId = new Map(Object.entries(ids).map(([name, id]) => [id, name]))
  return rows.map((r) => byId.get(r.id))
}

describe('import exception sorting', () => {
  it('opens newest first', async () => {
    expect(await order(null)).toEqual(['d', 'b', 'a', 'c'])
    expect(await order('newest', 'asc')).toEqual(['c', 'a', 'b', 'd'])
  })

  it('sorts by kind with the newest first inside a tie', async () => {
    expect(await order('kind', 'asc')).toEqual(['c', 'b', 'd', 'a'])
    expect(await order('kind', 'desc')).toEqual(['d', 'a', 'b', 'c'])
  })

  it('sorts by row with the newest first inside a tie', async () => {
    expect(await order('row', 'asc')).toEqual(['b', 'c', 'd', 'a'])
  })
})

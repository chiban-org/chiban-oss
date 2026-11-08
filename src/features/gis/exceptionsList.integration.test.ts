import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { importExceptions, importRuns } from '@/db/schema'
import { type ExceptionSortKey, readExceptionView } from '@/features/gis/exceptionSort'
import { exceptionFacets, listExceptions } from '@/features/gis/exceptionsList'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeParcel, seedParcelWorld } from '@/test/parcels'

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

describe('import exception filters', () => {
  it('opens on open exceptions and keeps one kind at a time', () => {
    expect(readExceptionView({}).status).toBe('open')
    expect(readExceptionView({ status: 'dismissed' }).status).toBe('dismissed')
    expect(readExceptionView({ status: 'nonsense' }).status).toBe('open')
    expect(readExceptionView({ kind: ['owner_changed', 'alias_conflict'] }).kind).toEqual([
      'owner_changed',
    ])
    expect(readExceptionView({ kind: 'nonsense' }).kind).toEqual([])
  })

  it('counts each status inside the chosen kind and each kind inside the chosen status', async () => {
    await handle.db
      .update(importExceptions)
      .set({ status: 'dismissed' })
      .where(eq(importExceptions.id, ids.a ?? ''))
    const all = await exceptionFacets(handle.db, { status: 'open', kind: [] }, signal)
    expect(all.status.get('open')).toBe(3)
    expect(all.status.get('dismissed')).toBe(1)
    expect(all.kind.get('owner_changed')).toBe(1)
    expect(all.kind.get('invalid_geometry')).toBe(1)
    const owners = await exceptionFacets(
      handle.db,
      { status: 'dismissed', kind: ['owner_changed'] },
      signal,
    )
    expect(owners.status.get('open')).toBe(1)
    expect(owners.status.get('dismissed')).toBe(1)
    expect(owners.kind.get('owner_changed')).toBe(1)
    expect(owners.kind.get('invalid_geometry')).toBe(0)
  })
})

describe('import exceptions on one parcel', () => {
  it('reads a parcel filter only when it is a record id', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e'
    expect(readExceptionView({ parcel: id }).parcel).toBe(id)
    expect(readExceptionView({ parcel: 'nonsense' }).parcel).toBeNull()
    expect(readExceptionView({}).parcel).toBeNull()
  })

  it('lists and counts only the exceptions on that parcel, by ID or by payload', async () => {
    await seedParcelWorld(handle.db)
    const parcelId = await makeParcel(handle.db, [{ format: 'gis12', value: '3' }])
    const [run] = await handle.db.select({ id: importRuns.id }).from(importRuns).limit(1)
    const [byPayload] = await handle.db
      .insert(importExceptions)
      .values({
        layerKey: 'parcels',
        firstRunId: run?.id ?? '',
        lastSeenRunId: run?.id ?? '',
        rowKey: 'id:999',
        kind: 'invalid_geometry',
        contentHash: 'e',
        payload: { parcelId },
        detail: 'e',
      })
      .returning({ id: importExceptions.id })
    const rows = await listExceptions(handle.db, { parcelId }, signal)
    expect(rows.map((r) => r.id).sort()).toEqual([ids.a, ids.d, byPayload?.id].sort())
    const facets = await exceptionFacets(
      handle.db,
      { status: 'open', kind: [], parcel: parcelId },
      signal,
    )
    expect(facets.kind.get('owner_changed')).toBe(1)
    expect(facets.kind.get('invalid_geometry')).toBe(1)
    expect(facets.kind.get('alias_conflict')).toBe(0)
  })
})

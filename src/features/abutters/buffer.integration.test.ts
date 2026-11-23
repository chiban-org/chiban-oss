import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bufferedParcels } from '@/features/abutters/adjacency'
import { projectedSridParam } from '@/features/abutters/projection/srid'
import { importScenario, namesOf } from '@/test/abutterWorld'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let ids: Record<string, string>

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  ids = await importScenario(handle.db, world.staff)
})
afterEach(async () => {
  await handle.drop()
})

async function distanceFt(from: string, to: string): Promise<number> {
  const result = await handle.db.execute<{ feet: number }>(sql`
    select ST_Distance(
      ST_Transform(a.geom, ${projectedSridParam()}),
      ST_Transform(b.geom, ${projectedSridParam()})
    )::float8 as feet
    from parcels a, parcels b
    where a.id = ${ids[from] ?? ''} and b.id = ${ids[to] ?? ''}
  `)
  return result.rows[0]?.feet ?? Number.NaN
}

const buffered = (names: string[], bufferFt: number) =>
  handle.db.transaction((tx) =>
    bufferedParcels(
      tx,
      names.map((n) => ids[n] ?? ''),
      bufferFt,
      signal,
    ),
  )

describe('bufferedParcels', () => {
  it('finds the nearer non-adjacent parcel and not the farther, and never the applicant', async () => {
    const near = await distanceFt('A', 'M4')
    const far = await distanceFt('A', 'B')
    expect(near).toBeGreaterThan(1)
    expect(far).toBeGreaterThan(near)
    const found = namesOf(ids, await buffered(['A'], (near + far) / 2))
    expect(found).toContain('M4')
    expect(found).not.toContain('B')
    expect(found).not.toContain('A')
  })

  it('measures from the union of several applicant parcels', async () => {
    const found = namesOf(ids, await buffered(['A', 'M4'], (await distanceFt('M4', 'B')) + 1))
    expect(found).toContain('B')
    expect(found).not.toContain('A')
    expect(found).not.toContain('M4')
  })

  it('returns nothing when there are no applicant parcels', async () => {
    expect(await buffered([], 500)).toEqual([])
  })
})

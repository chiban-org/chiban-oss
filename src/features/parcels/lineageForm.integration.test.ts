import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parcelAliases, parcels } from '@/db/schema'
import { submitLineage } from '@/features/parcels/lineageForm'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const NOW = new Date('2027-06-01T12:00:00Z')
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

async function counts() {
  const [p, a] = await Promise.all([
    handle.db.select().from(parcels),
    handle.db.select().from(parcelAliases),
  ])
  return { parcels: p.length, aliases: a.length }
}

const base = {
  kind: 'subdivision' as const,
  effectiveDate: '2027-04-12',
  effectiveBasis: 'recording' as const,
}

describe('submitLineage', () => {
  it('creates no placeholder when a later child id is malformed', async () => {
    const actor = await staffActor(handle.db)
    await makeParcel(handle.db, [{ format: 'gis12', value: '007020000000' }])
    const before = await counts()
    const r = await submitLineage(
      handle.db,
      actor,
      { ...base, parents: '007020000000', children: '007020001000 NOT-AN-ID' },
      signal,
      NOW,
    )
    expect(r.ok).toBe(false)
    expect(await counts()).toEqual(before)
  })

  it('creates no placeholder when the event itself is refused', async () => {
    const actor = await staffActor(handle.db)
    await makeParcel(handle.db, [{ format: 'gis12', value: '007030000000' }])
    const before = await counts()
    const r = await submitLineage(
      handle.db,
      actor,
      { ...base, kind: 'merge', parents: '007030000000', children: '007030001000' },
      signal,
      NOW,
    )
    expect(r.ok).toBe(false)
    expect(await counts()).toEqual(before)
  })

  it('creates the placeholders and the event together on success', async () => {
    const actor = await staffActor(handle.db)
    await makeParcel(handle.db, [{ format: 'gis12', value: '007040000000' }])
    const before = await counts()
    const r = await submitLineage(
      handle.db,
      actor,
      { ...base, parents: '007040000000', children: '007040001000 007040002000' },
      signal,
      NOW,
    )
    expect(r.ok).toBe(true)
    expect(await counts()).toEqual({ parcels: before.parcels + 2, aliases: before.aliases + 2 })
  })
})

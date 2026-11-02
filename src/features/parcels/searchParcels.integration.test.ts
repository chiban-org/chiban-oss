import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parcelIdFormats } from '@/db/schema'
import { searchParcels } from '@/features/parcels/searchParcels'
import { makeTestCaller } from '@/server/testCaller'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let condo: string
let retired: string
let heron: string
let larkAlias: string
let ownerOnly: string

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  await handle.db
    .insert(parcelIdFormats)
    .values({ key: 'folder', label: 'Folder label', kind: 'free_text', width: null })
  condo = await makeParcel(
    handle.db,
    [
      { format: 'gis12', value: '007014000000' },
      { format: 'cama15', value: '007014000000001' },
      { format: 'cama15', value: '007014000000002' },
      { format: 'cama15', value: '007014000000003' },
    ],
    { siteAddress: '40 Alder Pond Road', ownerName: 'Marsh Wren Holdings LLC' },
  )
  retired = await makeParcel(
    handle.db,
    [{ format: 'gis12', value: '007020000000', status: 'retired' }],
    { status: 'retired' },
  )
  heron = await makeParcel(handle.db, [{ format: 'gis12', value: '007001000000' }], {
    siteAddress: '12 Heron Cove Road',
    ownerName: 'Pennywhistle Land Company',
  })
  larkAlias = await makeParcel(handle.db, [{ format: 'folder', value: 'LARKSPUR-001' }], {
    siteAddress: '5 Willow Bend',
  })
  ownerOnly = await makeParcel(handle.db, [{ format: 'gis12', value: '007002000000' }], {
    siteAddress: '6 Tamarack Way',
    ownerName: 'Larkspur Family Trust',
  })
})
afterAll(async () => {
  await handle.drop()
})

const ids = (hits: { parcelId: string }[]) => hits.map((h) => h.parcelId)

describe('searchParcels', () => {
  it('cama id finds the condo parcel', async () => {
    const hits = await searchParcels(handle.db, { q: '007014000000002' }, signal)
    expect(ids(hits)).toEqual([condo])
    expect(hits[0]).toMatchObject({
      displayId: '007014000000',
      matchedOn: 'alias_exact',
      matchedAlias: { format: 'cama15', value: '007014000000002', status: 'active' },
    })
  })

  it('gis id finds the same parcel', async () => {
    expect(ids(await searchParcels(handle.db, { q: '007014000000' }, signal))[0]).toBe(condo)
  })

  it('punctuation is ignored', async () => {
    const hits = await searchParcels(handle.db, { q: '007-014 000 000' }, signal)
    expect(hits[0]?.parcelId).toBe(condo)
    expect(hits[0]?.matchedOn).toBe('alias_exact')
  })

  it('prefix 007014 finds the parcel with matchedOn alias_prefix', async () => {
    const hits = await searchParcels(handle.db, { q: '007014' }, signal)
    expect(hits[0]).toMatchObject({ parcelId: condo, matchedOn: 'alias_prefix' })
  })

  it('retired id is found and labeled', async () => {
    const hits = await searchParcels(handle.db, { q: '007020000000' }, signal)
    expect(hits[0]).toMatchObject({
      parcelId: retired,
      status: 'retired',
      matchedAlias: { status: 'retired', value: '007020000000' },
    })
  })

  it('address search "12 Heron Cove" finds the parcel', async () => {
    const hits = await searchParcels(handle.db, { q: '12 Heron Cove' }, signal)
    expect(hits[0]).toMatchObject({ parcelId: heron, matchedOn: 'address' })
  })

  it('owner search "Larkspur" ranks after alias matches', async () => {
    const hits = await searchParcels(handle.db, { q: 'Larkspur' }, signal)
    expect(hits[0]).toMatchObject({ parcelId: larkAlias, matchedOn: 'alias_prefix' })
    const order = hits.map((h) => h.matchedOn)
    expect(order.at(-1)).toBe('owner')
    expect(ids(hits)).toContain(ownerOnly)
  })

  it('limit caps results at 50 even when asked for 500', async () => {
    for (let i = 0; i < 55; i += 1) {
      await makeParcel(handle.db, [], { siteAddress: `${i} Birch Hollow Road` })
    }
    const hits = await searchParcels(handle.db, { q: 'Birch Hollow', limit: 500 }, signal)
    expect(hits).toHaveLength(50)
    expect(await searchParcels(handle.db, { q: 'Birch Hollow' }, signal)).toHaveLength(20)
  })

  it('query of one character returns nothing', async () => {
    expect(await searchParcels(handle.db, { q: '0' }, signal)).toEqual([])
  })

  it('wildcard characters match literally', async () => {
    expect(await searchParcels(handle.db, { q: '%%' }, signal)).toEqual([])
  })

  it('search has no per-viewer row filter by design', async () => {
    const staff = makeTestCaller(handle.db, await staffActor(handle.db))
    const anon = makeTestCaller(handle.db, null)
    const a = await staff.parcels.search({ q: 'Heron' })
    const b = await anon.parcels.search({ q: 'Heron' })
    expect(b).toEqual(a)
    expect(ids(b)).toContain(heron)
  })
})

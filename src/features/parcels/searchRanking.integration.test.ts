import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { searchParcels } from '@/features/parcels/searchParcels'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeParcel, seedParcelWorld } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let trustOnLane: string
let trustOnHeron: string
let laneNeighbor: string
let otherTrust: string

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  trustOnLane = await makeParcel(handle.db, [{ format: 'gis12', value: '007013000000' }], {
    siteAddress: '12 Larkspur Lane',
    ownerName: 'Larkspur Family Trust',
  })
  laneNeighbor = await makeParcel(handle.db, [{ format: 'gis12', value: '007014000000' }], {
    siteAddress: '14 Larkspur Lane',
    ownerName: 'Marsh Wren Holdings LLC',
  })
  trustOnHeron = await makeParcel(handle.db, [{ format: 'gis12', value: '007001000000' }], {
    siteAddress: '12 Heron Cove Road',
    ownerName: 'Larkspur Family Trust',
  })
  otherTrust = await makeParcel(handle.db, [{ format: 'gis12', value: '009003000000' }], {
    siteAddress: '6 Scenario Lane',
    ownerName: 'Teasel Family Trust',
  })
})
afterAll(async () => {
  await handle.drop()
})

const ids = (hits: { parcelId: string }[]) => hits.map((h) => h.parcelId)

describe('text search ranking', () => {
  it('a full owner name finds only that owner, not lookalike addresses or other trusts', async () => {
    const hits = await searchParcels(handle.db, { q: 'Larkspur Family Trust' }, signal)
    expect(new Set(ids(hits))).toEqual(new Set([trustOnLane, trustOnHeron]))
    expect(hits.every((h) => h.matchedOn === 'owner')).toBe(true)
  })

  it('a word in both an owner and a street finds both, labelled by where it matched', async () => {
    const hits = await searchParcels(handle.db, { q: 'Larkspur' }, signal)
    expect(new Set(ids(hits))).toEqual(new Set([trustOnLane, laneNeighbor, trustOnHeron]))
    expect(hits.find((h) => h.parcelId === trustOnHeron)?.matchedOn).toBe('owner')
    expect(hits.find((h) => h.parcelId === laneNeighbor)?.matchedOn).toBe('address')
    expect(ids(hits)).not.toContain(otherTrust)
  })

  it('a misspelled owner still finds the owner when nothing matches exactly', async () => {
    const hits = await searchParcels(handle.db, { q: 'Larkspurr Family Trust' }, signal)
    expect(ids(hits).slice(0, 2).sort()).toEqual([trustOnLane, trustOnHeron].sort())
  })

  it('a full address ranks the exact parcel first', async () => {
    const hits = await searchParcels(handle.db, { q: '14 Larkspur Lane' }, signal)
    expect(ids(hits)).toEqual([laneNeighbor])
  })

  it('keeps an exact owner match when fuzzy lookalikes outnumber the result limit', async () => {
    for (let n = 0; n < 4; n += 1) {
      await makeParcel(handle.db, [{ format: 'gis12', value: `00804${n}000000` }], {
        siteAddress: `${n + 1} Larkspar Way`,
        ownerName: `Larkspar Family Trusts ${n}`,
      })
    }
    const hits = await searchParcels(handle.db, { q: 'Larkspur Family Trust', limit: 2 }, signal)
    expect(new Set(ids(hits))).toEqual(new Set([trustOnLane, trustOnHeron]))
  })
})

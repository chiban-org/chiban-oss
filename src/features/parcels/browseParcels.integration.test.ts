import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { browseParcels } from '@/features/parcels/browseParcels'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeParcel, seedParcelWorld } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

async function addParcels(count: number, start: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    const value = String(start + i).padStart(12, '0')
    await makeParcel(handle.db, [{ format: 'gis12', value }], {
      siteAddress: `${start + i} Browse Lane`,
      ownerName: `Owner ${start + i}`,
    })
  }
}

describe('browsing parcels without a search', () => {
  it('returns every parcel with no next page when there are fewer than the page size', async () => {
    await addParcels(3, 900000000001)
    const page = await browseParcels(handle.db, { offset: 0, limit: 20 }, signal)
    expect(page.rows.length).toBe(page.total)
    expect(page.total).toBeLessThan(20)
    expect(page.nextOffset).toBeNull()
    expect(page.prevOffset).toBeNull()
  })

  it('pages through more parcels than the page size in display ID order without repeats', async () => {
    await addParcels(8, 900000000101)
    const first = await browseParcels(handle.db, { offset: 0, limit: 5 }, signal)
    expect(first.rows).toHaveLength(5)
    expect(first.nextOffset).toBe(5)
    const second = await browseParcels(handle.db, { offset: 5, limit: 5 }, signal)
    expect(second.prevOffset).toBe(0)
    const ids = [...first.rows, ...second.rows].map((r) => r.parcelId)
    expect(new Set(ids).size).toBe(ids.length)
    const labels = [...first.rows, ...second.rows].map((r) => r.displayId ?? '')
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)))
  })

  it('lands on the last page when the offset is past the end', async () => {
    const page = await browseParcels(handle.db, { offset: 10000, limit: 5 }, signal)
    expect(page.rows.length).toBeGreaterThan(0)
    expect(page.nextOffset).toBeNull()
    expect(page.offset).toBeLessThan(page.total)
  })
})

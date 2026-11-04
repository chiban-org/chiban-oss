import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pickedParcelFor } from '@/features/parcels/parcelPick'
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

describe('pickedParcelFor', () => {
  it('turns a typed parcel ID into the parcel a picker starts with', async () => {
    const parcelId = await makeParcel(handle.db, [{ format: 'gis12', value: '007060000000' }], {
      siteAddress: '9 Cattail Road',
      ownerName: 'Bulrush Holdings',
    })
    expect(await pickedParcelFor(handle.db, '007-060-000-000', signal)).toEqual({
      parcelId,
      displayId: '007060000000',
      status: 'active',
      siteAddress: '9 Cattail Road',
      ownerName: 'Bulrush Holdings',
    })
  })

  it('is null for an ID no parcel has', async () => {
    expect(await pickedParcelFor(handle.db, '999999999999', signal)).toBeNull()
  })
})

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { searchExample } from '@/features/parcels/searchExample'
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

describe('searchExample', () => {
  it('offers nothing when the town has no parcels with an address', async () => {
    await makeParcel(handle.db, [{ format: 'gis12', value: '007030000000' }])
    expect(await searchExample(handle.db, signal)).toBeNull()
  })

  it('offers a real active parcel with its address and display ID, never a retired one', async () => {
    await makeParcel(handle.db, [{ format: 'gis12', value: '007002000000', status: 'retired' }], {
      status: 'retired',
      siteAddress: '1 Retired Lane',
    })
    await makeParcel(handle.db, [{ format: 'gis12', value: '007001000000' }], {
      siteAddress: '12 Heron Cove Road',
    })
    expect(await searchExample(handle.db, signal)).toEqual({
      address: '12 Heron Cove Road',
      displayId: '007001000000',
    })
  })
})

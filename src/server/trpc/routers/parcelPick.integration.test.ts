import { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadActor } from '@/features/auth/actor'
import { makeTestCaller } from '@/server/testCaller'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let condo: string
let retired: string

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  condo = await makeParcel(
    handle.db,
    [
      { format: 'gis12', value: '007014000000' },
      { format: 'cama15', value: '007014000000001' },
    ],
    { siteAddress: '40 Alder Pond Road', ownerName: 'Marsh Wren Holdings LLC' },
  )
  retired = await makeParcel(
    handle.db,
    [{ format: 'gis12', value: '007020000000', status: 'retired' }],
    { status: 'retired', siteAddress: '3 Old Mill Lane', ownerName: 'Quillfeather Trust' },
  )
  for (let n = 0; n < 12; n += 1) {
    const lot = String(100 + n).padStart(3, '0')
    await makeParcel(handle.db, [{ format: 'gis12', value: `009${lot}000000` }], {
      siteAddress: `${n + 1} Birchbark Lane`,
      ownerName: 'Birchbark Partners',
    })
  }
})
afterAll(async () => {
  await handle.drop()
})

async function staff() {
  return makeTestCaller(handle.db, await staffActor(handle.db))
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (e) {
    if (e instanceof TRPCError) return e.code
    throw e
  }
  return 'OK'
}

describe('parcels.pick', () => {
  it('finds a parcel by site address with its display ID, address and owner', async () => {
    const hits = await (await staff()).parcels.pick({ q: '40 Alder Pond' })
    expect(hits[0]).toEqual({
      parcelId: condo,
      displayId: '007014000000',
      status: 'active',
      siteAddress: '40 Alder Pond Road',
      ownerName: 'Marsh Wren Holdings LLC',
    })
  })

  it('finds a parcel by owner name', async () => {
    const hits = await (await staff()).parcels.pick({ q: 'Marsh Wren' })
    expect(hits.map((h) => h.parcelId)).toContain(condo)
  })

  it.each([
    ['the 12 digit map-lot ID', '007014000000'],
    ['the dashed map-lot form', '007-014-000-000'],
    ['the 15 digit CAMA number', '007014000000001'],
    ['a leading prefix of the ID', '0070140'],
  ])('finds a parcel by %s', async (_label, q) => {
    const hits = await (await staff()).parcels.pick({ q })
    expect(hits[0]?.parcelId).toBe(condo)
  })

  it('labels a retired parcel as retired', async () => {
    const hits = await (await staff()).parcels.pick({ q: '007020000000' })
    expect(hits[0]).toMatchObject({ parcelId: retired, status: 'retired' })
  })

  it('returns at most eight matches', async () => {
    const hits = await (await staff()).parcels.pick({ q: 'Birchbark' })
    expect(hits).toHaveLength(8)
  })

  it('returns nothing for a one character query', async () => {
    expect(await (await staff()).parcels.pick({ q: '4' })).toEqual([])
  })

  it('refuses a caller who is not signed in', async () => {
    expect(await codeOf(makeTestCaller(handle.db, null).parcels.pick({ q: 'Alder' }))).toBe(
      'UNAUTHORIZED',
    )
  })

  it('refuses a signed-in applicant', async () => {
    const applicant = await loadActor(
      handle.db,
      await makeUser(handle.db, { role: 'applicant' }),
      signal,
    )
    expect(await codeOf(makeTestCaller(handle.db, applicant).parcels.pick({ q: 'Alder' }))).toBe(
      'FORBIDDEN',
    )
  })
})

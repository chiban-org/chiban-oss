import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { enforcementCases, enforcementOrders, orderServiceRecipients, parcels } from '@/db/schema'
import { seedDemo } from '@/features/demo/seedDemo'
import { makeTestDb, type TestDb } from '@/test/db'
import { demoSeedDeps } from '@/test/demoSeedDeps'

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  await seedDemo(handle.db, signal, await demoSeedDeps())
}, 300_000)
afterAll(async () => {
  await handle.drop()
})

describe('seeded enforcement case locations', () => {
  it('every case linked to a parcel is located at that parcel', async () => {
    const rows = await handle.db
      .select({ location: enforcementCases.locationText, address: parcels.siteAddress })
      .from(enforcementCases)
      .innerJoin(parcels, eq(parcels.id, enforcementCases.parcelId))
    expect(rows.length).toBeGreaterThan(0)
    const elsewhere = rows.filter(
      (r) => !r.location.toLowerCase().startsWith((r.address ?? '').toLowerCase()),
    )
    expect(elsewhere).toEqual([])
  })

  it('every owner listed on a seeded order is the owner of record of its parcel', async () => {
    const rows = await handle.db
      .select({ listed: orderServiceRecipients.name, owner: parcels.ownerName })
      .from(orderServiceRecipients)
      .innerJoin(enforcementOrders, eq(enforcementOrders.id, orderServiceRecipients.orderId))
      .innerJoin(enforcementCases, eq(enforcementCases.id, enforcementOrders.caseId))
      .innerJoin(parcels, eq(parcels.id, enforcementCases.parcelId))
      .where(eq(orderServiceRecipients.role, 'record_owner'))
    expect(rows.filter((r) => r.listed !== r.owner)).toEqual([])
  })
})

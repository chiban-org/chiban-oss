import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clocks } from '@/db/schema'
import { expiryDates } from '@/features/applications/expiryDates'
import { startClocksFor } from '@/features/clocks/startClocks'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

describe('expiry dates', () => {
  it('lists the due date of a running lapse clock and drops it once the clock is met', async () => {
    const app = await makeApplication(handle.db, world, { state: 'issued', issuedOn: '2027-03-15' })
    await handle.db.transaction((tx) =>
      startClocksFor(tx, app.applicationId, 'permit_issued', d('2027-03-15'), signal),
    )
    expect((await expiryDates(handle.db, [app.applicationId])).get(app.applicationId)).toBe(
      '2028-03-15',
    )
    await handle.db
      .update(clocks)
      .set({ status: 'met', metOn: d('2027-06-01') })
      .where(
        and(eq(clocks.applicationId, app.applicationId), eq(clocks.ruleKey, 'town.bp.expiration')),
      )
    expect((await expiryDates(handle.db, [app.applicationId])).has(app.applicationId)).toBe(false)
  })
})

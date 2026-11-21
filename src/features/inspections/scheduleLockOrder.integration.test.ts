import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Tx } from '@/db/client'
import { inspections } from '@/db/schema'
import { cancelInspection, scheduleInspection } from '@/features/inspections/schedule'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  civil,
  INSPECTION_NOW,
  type InspectionWorld,
  insertInspection,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { runWhileApplicationLocked } from '@/test/lockOrder'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let w: InspectionWorld

beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

async function rowOf(id: string) {
  const [r] = await handle.db.select().from(inspections).where(eq(inspections.id, id))
  if (r === undefined) throw new Error('missing inspection')
  return r
}

const lockInspection = (id: string) => (tx: Tx) =>
  tx
    .select({ id: inspections.id })
    .from(inspections)
    .where(eq(inspections.id, id))
    .for('update', { skipLocked: true })

describe('inspection scheduling takes the application lock before the inspection', () => {
  it('booking leaves the inspection free to a holder of the application lock', async () => {
    const applicationId = w.trade.applicationId
    const id = await insertInspection(handle.db, applicationId, 'rough', { channel: 'phone' })
    const inspector = await staffActor(handle.db, 'inspector')
    const { rowVersion } = await rowOf(id)
    const outcome = await runWhileApplicationLocked(
      handle.db,
      applicationId,
      () =>
        scheduleInspection(
          handle.db,
          w.world.staff,
          {
            inspectionId: id,
            inspectorUserId: inspector.userId,
            date: civil('2027-07-07'),
            startMinute: 570,
            expectedRowVersion: rowVersion,
          },
          signal,
          { now: INSPECTION_NOW },
        ),
      lockInspection(id),
    )
    expect(outcome).toMatchObject({ finishedWhileLocked: false, rowFreeToHolder: true })
    expect(outcome.result.ok).toBe(true)
    expect((await rowOf(id)).status).toBe('scheduled')
  })

  it('cancelling leaves the inspection free to a holder of the application lock', async () => {
    const applicationId = w.trade.applicationId
    const id = await insertInspection(handle.db, applicationId, 'rough', { channel: 'phone' })
    const { rowVersion } = await rowOf(id)
    const outcome = await runWhileApplicationLocked(
      handle.db,
      applicationId,
      () =>
        cancelInspection(
          handle.db,
          w.world.staff,
          { inspectionId: id, reason: 'staff', expectedRowVersion: rowVersion },
          signal,
        ),
      lockInspection(id),
    )
    expect(outcome).toMatchObject({ finishedWhileLocked: false, rowFreeToHolder: true })
    expect(outcome.result.ok).toBe(true)
    expect((await rowOf(id)).status).toBe('cancelled')
  })
})

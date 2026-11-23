import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applications, clocks, inspections } from '@/db/schema'
import { setActivePackForTest } from '@/features/packs/registry'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  type InspectionWorld,
  passingItems,
  RESULT_NOW,
  scheduledInspection,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { XX_COMMENCEMENT_KEY, XX_TRIGGER_CLOCKS } from '@/test/packs/xx/triggerVariants'
import {
  clockRows,
  issuedCommencementPermit,
  publishCommencementType,
} from '@/test/triggerClockFixtures'
import type { CivilDate } from '@/types/civilDate'
import { recordInspectionResult } from './recordResult'

const signal = new AbortController().signal
const ISSUED = '2027-06-20' as CivilDate
const BLOCKED_MS = 400
let handle: TestDb
let w: InspectionWorld

beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
  setActivePackForTest(XX_TRIGGER_CLOCKS)
  await publishCommencementType(handle.db, w)
})
afterAll(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

function expiryOrderLocks(applicationId: string) {
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let locked: () => void = () => undefined
  const holding = new Promise<void>((resolve) => {
    locked = resolve
  })
  const done = handle.db.transaction(async (tx) => {
    await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .for('update')
    locked()
    await gate
    return await tx
      .select({ id: clocks.id })
      .from(clocks)
      .where(and(eq(clocks.applicationId, applicationId), eq(clocks.ruleKey, XX_COMMENCEMENT_KEY)))
      .for('update', { skipLocked: true })
  })
  return { holding, release, done }
}

describe('recording an inspection result takes the application lock first', () => {
  it('leaves the clock free for a holder of the application lock, as the expiry job takes them', async () => {
    const applicationId = await issuedCommencementPermit(handle.db, w, ISSUED)
    const inspectionId = await scheduledInspection(handle.db, w.inspector, applicationId, 'rough')
    const [row] = await handle.db.select().from(inspections).where(eq(inspections.id, inspectionId))
    const items = await passingItems(handle.db, applicationId, 'rough')
    const blocker = expiryOrderLocks(applicationId)
    await blocker.holding
    let finished = false
    const recording = recordInspectionResult(
      handle.db,
      w.inspector,
      { inspectionId, expectedRowVersion: row?.rowVersion ?? 0, result: 'passed', items },
      signal,
      { now: RESULT_NOW },
    ).then((r) => {
      finished = true
      return r
    })
    await new Promise((resolve) => setTimeout(resolve, BLOCKED_MS))
    const finishedWhileLocked = finished
    blocker.release()
    const clockLockedByBlocker = await blocker.done
    expect(finishedWhileLocked).toBe(false)
    expect(clockLockedByBlocker).toHaveLength(1)
    expect((await recording).ok).toBe(true)
    const commencement = (await clockRows(handle.db, applicationId)).find(
      (c) => c.ruleKey === XX_COMMENCEMENT_KEY,
    )
    expect(commencement).toMatchObject({ status: 'met', metOn: '2027-07-07' })
  })
})

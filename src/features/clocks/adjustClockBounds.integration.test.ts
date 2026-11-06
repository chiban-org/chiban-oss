import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clockAdjustments, clocks } from '@/db/schema'
import { adjustClock } from '@/features/clocks/adjustClock'
import { MAX_ADJUSTMENT_DAYS } from '@/features/clocks/adjustmentKinds'
import { startClocksFor } from '@/features/clocks/startClocks'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

async function decisionClock() {
  const app = await makeApplication(handle.db, world, {
    facts: { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
  })
  await handle.db.transaction((tx) =>
    startClocksFor(
      tx,
      app.applicationId,
      'application_completed',
      '2027-03-01' as CivilDate,
      signal,
    ),
  )
  const [clock] = await handle.db
    .select()
    .from(clocks)
    .where(and(eq(clocks.applicationId, app.applicationId), eq(clocks.ruleKey, 'nh.bp.decision')))
  if (clock === undefined) throw new Error('no decision clock')
  return clock
}

function exception(clockId: string, days: number) {
  return {
    clockId,
    kind: 'statutory_exception' as const,
    days,
    reason: 'Court order',
    legalAuthority: { citation: 'Superior Court order', explanation: 'Stay of review' },
  }
}

describe('adjustClock day bounds', () => {
  it('caps a move at 365 days', () => {
    expect(MAX_ADJUSTMENT_DAYS).toBe(365)
  })

  it('refuses -5, 0, 366, 999999 and 1.5 days and records nothing', async () => {
    const clock = await decisionClock()
    for (const days of [-5, 0, 366, 999_999, 1.5]) {
      const result = await adjustClock(handle.db, world.admin, exception(clock.id, days), signal)
      expect([days, result]).toEqual([days, { ok: false, error: 'days_out_of_range' }])
    }
    const recorded = await handle.db
      .select()
      .from(clockAdjustments)
      .where(eq(clockAdjustments.clockId, clock.id))
    expect(recorded).toEqual([])
  })

  it('returns the new due date of a move', async () => {
    const clock = await decisionClock()
    expect(await adjustClock(handle.db, world.admin, exception(clock.id, 365), signal)).toEqual({
      ok: true,
      value: { newDue: '2028-03-30' },
    })
  })
})

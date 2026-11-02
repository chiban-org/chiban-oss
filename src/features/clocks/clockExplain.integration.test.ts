import type { ClockRule } from '@packs/nh/schema'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, clockAdjustments, clocks } from '@/db/schema'
import { adjustClock } from '@/features/clocks/adjustClock'
import { listClockAdjustments } from '@/features/clocks/clockOverrides'
import { explainClock } from '@/features/clocks/explainClock'
import { startClocksFor, stopRunningClocks } from '@/features/clocks/startClocks'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { saveAndPublish } from '@/test/configFixtures'
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

async function start(
  applicationId: string,
  event: Parameters<typeof startClocksFor>[2],
  on: string,
) {
  await handle.db.transaction((tx) => startClocksFor(tx, applicationId, event, d(on), signal))
}

async function clockOf(applicationId: string, ruleKey: string) {
  const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, applicationId))
  const row = rows.find((c) => c.ruleKey === ruleKey)
  if (row === undefined) throw new Error(`no clock ${ruleKey}`)
  return row
}

function decisionRule(): ClockRule {
  const rule = ruleByKey(loadPack(), 'nh.bp.decision')
  if (rule.kind !== 'clock') throw new Error('shape')
  return rule
}

describe('explainClock', () => {
  it('explanation lists rule, version, start event, counting method, consequence', async () => {
    const app = await makeApplication(handle.db, world, {
      facts: { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
    })
    await start(app.applicationId, 'application_completed', '2027-03-01')
    const explanation = explainClock(
      await clockOf(app.applicationId, 'nh.bp.decision'),
      [],
      decisionRule(),
      d('2027-03-20'),
    )
    expect(explanation).toMatchObject({
      ruleLabel: 'Building permit decision deadline',
      citation: { label: 'RSA 155-A:4 IX' },
      ruleKey: 'nh.bp.decision',
      ruleVersion: 1,
      packVersion: loadPack().version,
      startEvent: 'Application completed',
      startDate: '2027-03-01',
      computedDue: '2027-03-31',
      status: 'running',
      daysRemaining: 11,
    })
    expect(explanation.countingMethod).toContain('30 calendar days after 2027-03-01')
  })

  it('none_stated consequence renders its text', async () => {
    const app = await makeApplication(handle.db, world)
    await start(app.applicationId, 'application_completed', '2027-03-01')
    const explanation = explainClock(
      await clockOf(app.applicationId, 'nh.bp.decision'),
      [],
      decisionRule(),
      d('2027-03-20'),
    )
    expect(explanation.consequence).toBe(
      'RSA 155-A:4 IX states no consequence for a missed deadline. The application shows as overdue.',
    )
  })

  it('days remaining goes negative once past due', async () => {
    const app = await makeApplication(handle.db, world)
    await start(app.applicationId, 'application_completed', '2027-03-01')
    const explanation = explainClock(
      await clockOf(app.applicationId, 'nh.bp.decision'),
      [],
      decisionRule(),
      d('2027-04-05'),
    )
    expect(explanation.daysRemaining).toBe(-5)
  })
})

describe('listClockAdjustments', () => {
  async function adjusted() {
    const app = await makeApplication(handle.db, world, {
      facts: { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
    })
    await start(app.applicationId, 'application_completed', '2027-03-01')
    const clock = await clockOf(app.applicationId, 'nh.bp.decision')
    await adjustClock(
      handle.db,
      world.admin,
      {
        clockId: clock.id,
        kind: 'statutory_exception',
        days: 14,
        reason: 'Court order',
        legalAuthority: { citation: 'Order', explanation: 'Stay' },
      },
      signal,
    )
    return { app, clock }
  }

  it('lists a live adjustment as applied', async () => {
    await adjusted()
    expect((await listClockAdjustments(handle.db, signal)).map((r) => r.status)).toEqual([
      'applied',
    ])
  })

  it('adjustment on a closed application lists as expired', async () => {
    const { app } = await adjusted()
    await handle.db
      .update(applications)
      .set({ state: 'closed' })
      .where(eq(applications.id, app.applicationId))
    await handle.db.transaction((tx) => stopRunningClocks(tx, app.applicationId, signal))
    expect((await listClockAdjustments(handle.db, signal)).map((r) => r.status)).toEqual([
      'expired',
    ])
  })

  it('adjustment on a clock superseded by a rule change lists as no_match', async () => {
    const { clock } = await adjusted()
    await handle.db
      .update(clocks)
      .set({ status: 'superseded', supersededReason: 'rule_change:t1' })
      .where(eq(clocks.id, clock.id))
    expect((await listClockAdjustments(handle.db, signal)).map((r) => r.status)).toEqual([
      'no_match',
    ])
  })

  it('an adjustment whose superseded_by is set lists as superseded', async () => {
    const { clock } = await adjusted()
    await handle.db
      .update(clockAdjustments)
      .set({ supersededBy: clock.id })
      .where(eq(clockAdjustments.clockId, clock.id))
    expect((await listClockAdjustments(handle.db, signal)).map((r) => r.status)).toEqual([
      'superseded',
    ])
  })
})

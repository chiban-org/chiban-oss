import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, clockAdjustments, clocks, roleCapabilities } from '@/db/schema'
import {
  linkReliance,
  recordFinalApproval,
  recordRelianceResolution,
  recordRelianceResolutionTx,
} from '@/features/boards/exercise'
import { adjustClock } from '@/features/clocks/adjustClock'
import { clocksDailyJob } from '@/jobs/clocksDaily'
import { runJob } from '@/jobs/defineJob'
import {
  type BoardWorld,
  boardTypeBody,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { blockedOrSettled, holdOpen } from '@/test/lockWait'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const TODAY = d('2028-01-03')
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function decidedVariance(
  state: 'decided' | 'issued' = 'decided',
  typeKey = world.zbaTypeKey,
) {
  const id = await submitBoardApplication(handle.db, world, typeKey, '2027-03-02')
  await handle.db
    .update(applications)
    .set({ state, decidedOn: '2027-05-12' })
    .where(eq(applications.id, id))
  return id
}

async function exerciseClock(applicationId: string) {
  const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, applicationId))
  return rows.find((c) => c.ruleKey === 'nh.zba.exercise' && c.status !== 'superseded')
}

async function finalize(applicationId: string, on = '2027-05-12') {
  return await handle.db.transaction((tx) =>
    recordFinalApproval(tx, world.staff, { applicationId, finalOn: d(on) }, signal, TODAY),
  )
}

describe('recordFinalApproval', () => {
  it('refuses a final approval dated after today and starts no clock', async () => {
    const id = await decidedVariance()
    const result = await handle.db.transaction((tx) =>
      recordFinalApproval(
        tx,
        world.staff,
        { applicationId: id, finalOn: d('2028-02-01') },
        signal,
        d('2028-01-03'),
      ),
    )
    expect(result).toEqual({ ok: false, error: 'future_date' })
    expect(await exerciseClock(id)).toBeUndefined()
  })

  it('accepts a final approval dated today', async () => {
    const id = await decidedVariance()
    const result = await handle.db.transaction((tx) =>
      recordFinalApproval(
        tx,
        world.staff,
        { applicationId: id, finalOn: d('2028-01-03') },
        signal,
        d('2028-01-03'),
      ),
    )
    expect(result.ok).toBe(true)
  })

  it('final approval 2027-05-12 sets exercise due 2029-05-12', async () => {
    const id = await decidedVariance()
    expect(await finalize(id)).toEqual({ ok: true, value: { dueOn: '2029-05-12' } })
    expect(await exerciseClock(id)).toMatchObject({ source: 'pack_rule', currentDue: '2029-05-12' })
  })

  it('town ordinance of 36 months adopted by town meeting sets 2030-05-12 with source town_setting', async () => {
    await saveAndPublish(handle.db, world.admin, 'town_rule_setting', 'nh.zba.exercise', {
      ruleKey: 'nh.zba.exercise',
      value: 36,
      adoptingAuthority: 'Town Meeting',
      adoptedOn: '2027-03-09',
    })
    const id = await decidedVariance()
    expect(await finalize(id)).toEqual({ ok: true, value: { dueOn: '2030-05-12' } })
    expect(await exerciseClock(id)).toMatchObject({
      source: 'town_setting',
      replacedDue: '2029-05-12',
    })
  })

  it('a town value below 24 months cannot be published', async () => {
    await expect(
      saveAndPublish(handle.db, world.admin, 'town_rule_setting', 'nh.zba.exercise', {
        ruleKey: 'nh.zba.exercise',
        value: 18,
        adoptingAuthority: 'Town Meeting',
        adoptedOn: '2027-03-09',
      }),
    ).rejects.toThrow()
  })

  it('final approval on an administrative appeal is not_bound', async () => {
    await saveAndPublish(
      handle.db,
      world.admin,
      'application_type',
      'AAD',
      boardTypeBody('nh.zba_administrative_appeal', 'AAD', 'AAD'),
    )
    const id = await decidedVariance('decided', 'AAD')
    expect(await finalize(id)).toEqual({ ok: false, error: 'not_bound' })
  })

  it('final approval before a decision is not_decided', async () => {
    const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
    expect(await finalize(id)).toEqual({ ok: false, error: 'not_decided' })
  })

  it('a reviewer recording final approval is forbidden', async () => {
    const id = await decidedVariance()
    const result = await handle.db.transaction((tx) =>
      recordFinalApproval(
        tx,
        world.reviewer,
        { applicationId: id, finalOn: d('2027-05-12') },
        signal,
        TODAY,
      ),
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })

  it('a second final approval while the first is uncommitted leaves one running exercise clock', async () => {
    const id = await decidedVariance()
    const first = await holdOpen(handle.db, (tx) =>
      recordFinalApproval(
        tx,
        world.staff,
        { applicationId: id, finalOn: d('2027-05-12') },
        signal,
        TODAY,
      ),
    )
    const second = finalize(id)
    await blockedOrSettled(handle.db, second)
    await first.commit()
    await second
    const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, id))
    expect(
      rows.filter((c) => c.ruleKey === 'nh.zba.exercise' && c.status === 'running'),
    ).toHaveLength(1)
  })

  it('a system actor may record final approval', async () => {
    const id = await decidedVariance()
    const result = await handle.db.transaction((tx) =>
      recordFinalApproval(
        tx,
        { kind: 'system', job: 'appeals.daily' },
        { applicationId: id, finalOn: d('2027-05-12') },
        signal,
        TODAY,
      ),
    )
    expect(result.ok).toBe(true)
  })
})

describe('exercise extension and reliance', () => {
  it('good cause extension to 2030-01-31 by board.record is applied', async () => {
    const id = await decidedVariance()
    await finalize(id)
    const clock = await exerciseClock(id)
    const clerk = await staffActor(handle.db, 'inspector')
    await handle.db
      .insert(roleCapabilities)
      .values({ role: 'inspector', capability: 'board.record' })
    const result = await adjustClock(
      handle.db,
      clerk,
      {
        clockId: clock?.id ?? '',
        kind: 'extension',
        newDue: d('2030-01-31'),
        reason: 'Financing delayed by the lender',
      },
      signal,
    )
    expect(result.ok).toBe(true)
    expect((await exerciseClock(id))?.currentDue).toBe('2030-01-31')
  })

  it('a clock.adjust holder without board.record cannot extend a good cause clock', async () => {
    const id = await decidedVariance()
    await finalize(id)
    const clock = await exerciseClock(id)
    const clerk = await staffActor(handle.db, 'finance')
    await handle.db.insert(roleCapabilities).values({ role: 'finance', capability: 'clock.adjust' })
    const result = await adjustClock(
      handle.db,
      clerk,
      {
        clockId: clock?.id ?? '',
        kind: 'extension',
        newDue: d('2030-01-31'),
        reason: 'Financing delayed',
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })

  async function relianceSetup() {
    const variance = await decidedVariance()
    await finalize(variance)
    const planning = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-06-02')
    const linked = await linkReliance(
      handle.db,
      world.staff,
      { varianceApplicationId: variance, planningApplicationId: planning },
      signal,
    )
    expect(linked.ok).toBe(true)
    return { variance, planning }
  }

  it('reliance resolved 2029-02-01 floors the due at 2029-08-01', async () => {
    const { variance, planning } = await relianceSetup()
    const result = await recordRelianceResolution(
      handle.db,
      world.staff,
      {
        varianceApplicationId: variance,
        planningApplicationId: planning,
        resolvedOn: d('2029-02-01'),
      },
      signal,
    )
    expect(result).toEqual({ ok: true, value: { dueOn: '2029-08-01' } })
    expect((await exerciseClock(variance))?.currentDue).toBe('2029-08-01')
    const adjustments = await handle.db.select().from(clockAdjustments)
    expect(adjustments[0]).toMatchObject({ kind: 'statutory_floor', newDue: '2029-08-01' })
    expect(adjustments[0]?.reason).toContain('RSA 674:33')
  })

  it('a smaller reliance floor resolved while a larger one is uncommitted keeps the larger floor', async () => {
    const { variance, planning } = await relianceSetup()
    const other = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-06-03')
    await linkReliance(
      handle.db,
      world.staff,
      { varianceApplicationId: variance, planningApplicationId: other },
      signal,
    )
    const larger = await holdOpen(handle.db, (tx) =>
      recordRelianceResolutionTx(
        tx,
        world.staff,
        {
          varianceApplicationId: variance,
          planningApplicationId: planning,
          resolvedOn: d('2029-04-01'),
        },
        signal,
      ),
    )
    const smaller = recordRelianceResolution(
      handle.db,
      world.staff,
      {
        varianceApplicationId: variance,
        planningApplicationId: other,
        resolvedOn: d('2029-02-01'),
      },
      signal,
    )
    await blockedOrSettled(handle.db, smaller)
    await larger.commit()
    await smaller
    expect((await exerciseClock(variance))?.currentDue).toBe('2029-10-01')
  })

  it('reliance resolved 2028-01-10 leaves 2029-05-12 unchanged', async () => {
    const { variance, planning } = await relianceSetup()
    const result = await recordRelianceResolution(
      handle.db,
      world.staff,
      {
        varianceApplicationId: variance,
        planningApplicationId: planning,
        resolvedOn: d('2028-01-10'),
      },
      signal,
    )
    expect(result).toEqual({ ok: true, value: { dueOn: '2029-05-12' } })
    expect((await exerciseClock(variance))?.currentDue).toBe('2029-05-12')
    expect(await handle.db.select().from(clockAdjustments)).toHaveLength(0)
  })

  it('an unlinked resolution is not_linked', async () => {
    const variance = await decidedVariance()
    await finalize(variance)
    const planning = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-06-02')
    const result = await recordRelianceResolution(
      handle.db,
      world.staff,
      {
        varianceApplicationId: variance,
        planningApplicationId: planning,
        resolvedOn: d('2029-02-01'),
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'not_linked' })
  })

  it('reviewer linking reliance is forbidden', async () => {
    const variance = await decidedVariance()
    const planning = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-06-02')
    expect(
      await linkReliance(
        handle.db,
        world.reviewer,
        { varianceApplicationId: variance, planningApplicationId: planning },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('clocks.daily for exercise clocks', () => {
  it('daily job lapses an unexercised variance on 2029-05-13', async () => {
    const id = await decidedVariance('decided')
    await finalize(id)
    await runJob(handle.db, clocksDailyJob, { today: d('2029-05-12') }, signal)
    expect((await exerciseClock(id))?.status).toBe('running')
    await runJob(handle.db, clocksDailyJob, { today: d('2029-05-13') }, signal)
    expect((await exerciseClock(id))?.status).toBe('lapsed')
    const [app] = await handle.db.select().from(applications).where(eq(applications.id, id))
    expect(app?.state).toBe('expired')
  })
})

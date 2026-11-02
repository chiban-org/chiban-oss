import type { ClockRule } from '@packs/nh/schema'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applications,
  clockAdjustments,
  clocks,
  remediationTasks,
  ruleTransitionsApplied,
} from '@/db/schema'
import { listClockAdjustments } from '@/features/clocks/clockOverrides'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import {
  applyRuleTransition,
  previewRuleTransition,
  type RuleTransition,
} from '@/features/packs/ruleTransitions'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const SYSTEM = { kind: 'system' as const, job: 'rules:migrate' }
let handle: TestDb
let world: PermitWorld

function testRule(version: number, days: number): ClockRule {
  const base = ruleByKey(loadPack(), 'nh.bp.decision')
  if (base.kind !== 'clock') throw new Error('shape')
  return { ...base, key: 'test.decision', version, length: { unit: 'days', value: days } }
}

const PACK = { ...loadPack(), rules: [...loadPack().rules, testRule(1, 30), testRule(2, 20)] }

function transition(overrides: Partial<RuleTransition> = {}): RuleTransition {
  return {
    id: 't1',
    ruleKey: 'test.decision',
    fromVersion: 1,
    toVersion: 2,
    policy: 'switch',
    reason: 'Test rule shortened',
    ...overrides,
  }
}

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function runningV1(startDate = '2027-03-01') {
  const app = await makeApplication(handle.db, world, { state: 'under_review' })
  const [clock] = await handle.db
    .insert(clocks)
    .values({
      applicationId: app.applicationId,
      ruleKey: 'test.decision',
      ruleVersion: 1,
      packVersion: PACK.version,
      startEvent: 'application_completed',
      startDate,
      lengthValue: 30,
      lengthUnit: 'days',
      countingMethod: '30 calendar days',
      computedDue: '2027-03-31',
      currentDue: '2027-03-31',
      source: 'pack_rule',
    })
    .returning()
  if (clock === undefined) throw new Error('no clock')
  return { app, clock }
}

async function clocksOf(applicationId: string) {
  return await handle.db.select().from(clocks).where(eq(clocks.applicationId, applicationId))
}

describe('rule transitions', () => {
  it('preview lists running v1 clocks with old and new due', async () => {
    const { app, clock } = await runningV1()
    const preview = await previewRuleTransition(
      handle.db,
      transition(),
      d('2027-03-10'),
      signal,
      PACK,
    )
    expect(preview.affected).toEqual([
      {
        applicationId: app.applicationId,
        clockId: clock.id,
        oldDue: '2027-03-31',
        newDue: '2027-03-21',
        remediation: [],
      },
    ])
    expect(await clocksOf(app.applicationId)).toHaveLength(1)
  })

  it('switch supersedes the old clock with reason rule_change:t1 and keeps its due date', async () => {
    const { app, clock } = await runningV1()
    expect(await applyRuleTransition(handle.db, SYSTEM, transition(), signal, PACK)).toEqual({
      ok: true,
      value: { affected: 1 },
    })
    const rows = await clocksOf(app.applicationId)
    const old = rows.find((c) => c.id === clock.id)
    const fresh = rows.find((c) => c.id !== clock.id)
    expect(old).toMatchObject({
      status: 'superseded',
      supersededReason: 'rule_change:t1',
      currentDue: '2027-03-31',
      supersededBy: fresh?.id,
    })
    expect(fresh).toMatchObject({ ruleVersion: 2, status: 'running' })
  })

  it('new clock due is recomputed from the original start', async () => {
    const { app, clock } = await runningV1('2027-03-01')
    await applyRuleTransition(handle.db, SYSTEM, transition(), signal, PACK)
    const fresh = (await clocksOf(app.applicationId)).find((c) => c.id !== clock.id)
    expect(fresh).toMatchObject({
      startDate: '2027-03-01',
      computedDue: '2027-03-21',
      currentDue: '2027-03-21',
      lengthValue: 20,
    })
  })

  it('keep_old leaves every clock unchanged', async () => {
    const { app } = await runningV1()
    const r = await applyRuleTransition(
      handle.db,
      SYSTEM,
      transition({ policy: 'keep_old' }),
      signal,
      PACK,
    )
    expect(r).toEqual({ ok: true, value: { affected: 1 } })
    const rows = await clocksOf(app.applicationId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'running', ruleVersion: 1, currentDue: '2027-03-31' })
    const preview = await previewRuleTransition(
      handle.db,
      transition({ policy: 'keep_old' }),
      d('2027-03-10'),
      signal,
      PACK,
    )
    expect(preview.affected[0]?.newDue).toBeNull()
  })

  it('applying twice is already_applied', async () => {
    await runningV1()
    await applyRuleTransition(handle.db, SYSTEM, transition(), signal, PACK)
    expect(await applyRuleTransition(handle.db, SYSTEM, transition(), signal, PACK)).toEqual({
      ok: false,
      error: 'already_applied',
    })
    const [row] = await handle.db.select().from(ruleTransitionsApplied)
    expect(row).toMatchObject({ id: 't1', affected: 1, appliedBy: 'job:rules:migrate' })
  })

  it('adjustment on a superseded clock lists as no_match and gets a remediation task', async () => {
    const { app, clock } = await runningV1()
    await handle.db.insert(clockAdjustments).values({
      clockId: clock.id,
      kind: 'statutory_exception',
      days: 5,
      newDue: '2027-04-05',
      reason: 'Court order',
      createdBy: 'tester',
    })
    await applyRuleTransition(handle.db, SYSTEM, transition(), signal, PACK)
    expect((await listClockAdjustments(handle.db, signal)).map((r) => r.status)).toEqual([
      'no_match',
    ])
    const tasks = await handle.db
      .select()
      .from(remediationTasks)
      .where(eq(remediationTasks.applicationId, app.applicationId))
    expect(tasks).toMatchObject([
      {
        kind: 'review_adjustment',
        description: 'Review adjustment after rule change',
        status: 'open',
        transitionId: 't1',
      },
    ])
  })

  it('declared remediation creates one task per affected application', async () => {
    const one = await runningV1()
    const two = await runningV1('2027-03-02')
    const t = transition({
      remediation: (app) => [{ kind: 'renotice', description: `Re-send notice for ${app.number}` }],
    })
    await applyRuleTransition(handle.db, SYSTEM, t, signal, PACK)
    const tasks = await handle.db.select().from(remediationTasks)
    expect(tasks.map((x) => x.kind)).toEqual(['renotice', 'renotice'])
    expect(new Set(tasks.map((x) => x.applicationId))).toEqual(
      new Set([one.app.applicationId, two.app.applicationId]),
    )
    const preview = await previewRuleTransition(handle.db, t, d('2027-03-10'), signal, PACK)
    expect(preview.affected.every((a) => a.remediation.length === 1)).toBe(true)
  })

  it('only running clocks at the from version are touched', async () => {
    const { app, clock } = await runningV1()
    await handle.db.update(clocks).set({ status: 'met' }).where(eq(clocks.id, clock.id))
    expect(await applyRuleTransition(handle.db, SYSTEM, transition(), signal, PACK)).toEqual({
      ok: true,
      value: { affected: 0 },
    })
    expect(await clocksOf(app.applicationId)).toHaveLength(1)
  })

  it('a user without config.edit is forbidden and an admin may apply', async () => {
    await runningV1()
    expect(await applyRuleTransition(handle.db, world.staff, transition(), signal, PACK)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect((await applyRuleTransition(handle.db, world.admin, transition(), signal, PACK)).ok).toBe(
      true,
    )
  })

  it('an unrelated application row is left alone', async () => {
    await runningV1()
    const other = await makeApplication(handle.db, world)
    await applyRuleTransition(handle.db, SYSTEM, transition(), signal, PACK)
    expect(await clocksOf(other.applicationId)).toEqual([])
    expect(
      (
        await handle.db.select().from(applications).where(eq(applications.id, other.applicationId))
      )[0]?.state,
    ).toBe('draft')
  })
})

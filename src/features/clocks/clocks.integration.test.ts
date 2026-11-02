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

describe('startClocksFor', () => {
  it('resolves 30 days for one residential unit and 60 for eleven units', async () => {
    const small = await makeApplication(handle.db, world, {
      facts: { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
    })
    const big = await makeApplication(handle.db, world, {
      facts: { classification: 'residential', dwellingUnits: 11, afterTheFact: false },
    })
    const commercial = await makeApplication(handle.db, world, {
      facts: { classification: 'nonresidential', dwellingUnits: null, afterTheFact: false },
    })
    for (const a of [small, big, commercial])
      await start(a.applicationId, 'application_completed', '2027-03-01')
    expect((await clockOf(small.applicationId, 'nh.bp.decision')).computedDue).toBe('2027-03-31')
    expect((await clockOf(big.applicationId, 'nh.bp.decision')).computedDue).toBe('2027-04-30')
    expect((await clockOf(commercial.applicationId, 'nh.bp.decision')).computedDue).toBe(
      '2027-04-30',
    )
  })

  it('is idempotent while a clock is running and records the pack version', async () => {
    const app = await makeApplication(handle.db, world, {
      facts: { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
    })
    await start(app.applicationId, 'application_completed', '2027-03-01')
    await start(app.applicationId, 'application_completed', '2027-03-01')
    const rows = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, app.applicationId))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      ruleKey: 'nh.bp.decision',
      ruleVersion: 1,
      packVersion: loadPack().version,
      status: 'running',
      source: 'pack_rule',
      startEvent: 'application_completed',
      startDate: '2027-03-01',
    })
  })

  it('town value of 18 months shows source town_setting and the 12-month date it replaced', async () => {
    await saveAndPublish(handle.db, world.admin, 'town_rule_setting', 'town.bp.validity', {
      ruleKey: 'town.bp.validity',
      value: 18,
      adoptingAuthority: 'Select Board',
      adoptedOn: '2027-01-05',
    })
    const app = await makeApplication(handle.db, world)
    await start(app.applicationId, 'permit_issued', '2027-03-15')
    const clock = await clockOf(app.applicationId, 'town.bp.expiration')
    expect(clock).toMatchObject({
      source: 'town_setting',
      computedDue: '2028-09-15',
      replacedDue: '2028-03-15',
      lengthValue: 18,
      lengthUnit: 'months',
    })
    const explanation = explainClock(
      clock,
      [],
      ruleByKey(loadPack(), 'town.bp.expiration') as ClockRule,
      d('2027-04-01'),
    )
    expect(explanation.currentDue).toEqual({
      value: '2028-09-15',
      source: 'town_setting',
      replaced: { value: '2028-03-15', source: 'pack_rule' },
    })
  })

  it('a clock with no town setting uses the pack default of 12 months', async () => {
    const app = await makeApplication(handle.db, world)
    await start(app.applicationId, 'permit_issued', '2027-03-15')
    expect(await clockOf(app.applicationId, 'town.bp.expiration')).toMatchObject({
      source: 'pack_rule',
      computedDue: '2028-03-15',
      replacedDue: null,
    })
  })

  it('stopRunningClocks stops running clocks only', async () => {
    const app = await makeApplication(handle.db, world)
    await start(app.applicationId, 'permit_issued', '2027-03-15')
    await handle.db.transaction((tx) => stopRunningClocks(tx, app.applicationId, signal))
    expect((await clockOf(app.applicationId, 'town.bp.expiration')).status).toBe('stopped')
  })
})

describe('adjustClock', () => {
  async function decisionClock() {
    const app = await makeApplication(handle.db, world, {
      facts: { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
    })
    await start(app.applicationId, 'application_completed', '2027-03-01')
    return { app, clock: await clockOf(app.applicationId, 'nh.bp.decision') }
  }

  it('extension on nh.bp.decision is not_extendable', async () => {
    const { clock } = await decisionClock()
    const r = await adjustClock(
      handle.db,
      world.staff,
      { clockId: clock.id, kind: 'extension', days: 10, reason: 'Applicant asked' },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'not_extendable' })
  })

  it('waiver on nh.bp.decision is not_waivable', async () => {
    const { clock } = await decisionClock()
    const r = await adjustClock(
      handle.db,
      world.staff,
      { clockId: clock.id, kind: 'waiver', reason: 'Not needed' },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'not_waivable' })
  })

  it('staff without clock.adjust gets forbidden', async () => {
    const { clock } = await decisionClock()
    const r = await adjustClock(
      handle.db,
      world.reviewer,
      { clockId: clock.id, kind: 'extension', days: 10, reason: 'x' },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'forbidden' })
  })

  it('statutory exception by staff is forbidden and needs authority from an admin', async () => {
    const { clock } = await decisionClock()
    const input = {
      clockId: clock.id,
      kind: 'statutory_exception' as const,
      days: 14,
      reason: 'Court order',
    }
    expect(
      await adjustClock(
        handle.db,
        world.staff,
        { ...input, legalAuthority: { citation: 'RSA 1', explanation: 'x' } },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
    expect(await adjustClock(handle.db, world.admin, input, signal)).toEqual({
      ok: false,
      error: 'authority_required',
    })
  })

  it('admin statutory exception with authority moves the due date and shows the authority', async () => {
    const { clock } = await decisionClock()
    const r = await adjustClock(
      handle.db,
      world.admin,
      {
        clockId: clock.id,
        kind: 'statutory_exception',
        days: 14,
        reason: 'Court order extends the review',
        legalAuthority: {
          citation: 'Superior Court order 2027-03-10',
          explanation: 'Stay of review',
        },
      },
      signal,
    )
    expect(r.ok).toBe(true)
    const updated = await clockOf(clock.applicationId, 'nh.bp.decision')
    expect(updated.currentDue).toBe('2027-04-14')
    expect(updated.computedDue).toBe('2027-03-31')
    const adjustments = await handle.db
      .select()
      .from(clockAdjustments)
      .where(eq(clockAdjustments.clockId, clock.id))
    const explanation = explainClock(updated, adjustments, decisionRule(), d('2027-03-20'))
    expect(explanation.adjustments[0]).toMatchObject({
      kind: 'statutory_exception',
      days: 14,
      newDue: '2027-04-14',
      legalAuthority: {
        citation: 'Superior Court order 2027-03-10',
        explanation: 'Stay of review',
      },
    })
    expect(explanation.currentDue).toMatchObject({
      value: '2027-04-14',
      source: 'manual_override',
      replaced: { value: '2027-03-31', source: 'pack_rule' },
    })
  })

  it('an extension needing applicant consent is consent_required without it', async () => {
    const consentRule: ClockRule = {
      ...decisionRule(),
      key: 'test.consent',
      extension: { allowed: true, by: 'applicant_consent' },
    }
    const pack = { ...loadPack(), rules: [...loadPack().rules, consentRule] }
    const { clock } = await decisionClock()
    await handle.db.update(clocks).set({ ruleKey: 'test.consent' }).where(eq(clocks.id, clock.id))
    const input = {
      clockId: clock.id,
      kind: 'extension' as const,
      days: 7,
      reason: 'Applicant requested',
    }
    expect(await adjustClock(handle.db, world.staff, input, signal, pack)).toEqual({
      ok: false,
      error: 'consent_required',
    })
    const ok = await adjustClock(
      handle.db,
      world.staff,
      { ...input, applicantConsent: true },
      signal,
      pack,
    )
    expect(ok.ok).toBe(true)
    expect((await clockOf(clock.applicationId, 'test.consent')).currentDue).toBe('2027-04-07')
  })

  it('an adjustment without a reason is reason_required', async () => {
    const { clock } = await decisionClock()
    const r = await adjustClock(
      handle.db,
      world.admin,
      {
        clockId: clock.id,
        kind: 'statutory_exception',
        days: 1,
        reason: ' ',
        legalAuthority: { citation: 'RSA 1', explanation: 'x' },
      },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'reason_required' })
  })
})

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

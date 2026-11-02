import type { ClockRule } from '@packs/nh/schema'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clockAdjustments, clocks } from '@/db/schema'
import { adjustClock } from '@/features/clocks/adjustClock'
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

  it('an adjustment that moves an overdue clock forward returns it to running', async () => {
    const { clock } = await decisionClock()
    await handle.db.update(clocks).set({ status: 'overdue' }).where(eq(clocks.id, clock.id))
    const r = await adjustClock(
      handle.db,
      world.admin,
      {
        clockId: clock.id,
        kind: 'statutory_exception',
        days: 60,
        reason: 'Court order',
        legalAuthority: { citation: 'Order', explanation: 'Stay' },
      },
      signal,
    )
    expect(r.ok).toBe(true)
    expect((await clockOf(clock.applicationId, 'nh.bp.decision')).status).toBe('running')
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

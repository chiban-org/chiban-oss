import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, clocks, feeAssessments } from '@/db/schema'
import { renewPermit } from '@/features/building/renewal'
import { listClockAdjustments } from '@/features/clocks/clockOverrides'
import { startClocksFor } from '@/features/clocks/startClocks'
import { recordApplicationPayment } from '@/features/counter/applicationPayment'
import { feeBalance } from '@/features/ledger/feeBalance'
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

async function issued() {
  const app = await makeApplication(handle.db, world, { state: 'issued', issuedOn: '2027-03-15' })
  await handle.db.transaction((tx) =>
    startClocksFor(tx, app.applicationId, 'permit_issued', d('2027-03-15'), signal),
  )
  return app
}

const renew = (applicationId: string, renewedOn: string, actor = world.staff) =>
  renewPermit(handle.db, actor, { applicationId, renewedOn: d(renewedOn) }, signal)

describe('renewPermit', () => {
  it('renewal on 2028-03-01 moves due to 2029-03-01 and assesses 4500', async () => {
    const app = await issued()
    expect(await renew(app.applicationId, '2028-03-01')).toEqual({
      ok: true,
      value: { newDue: '2029-03-01' },
    })
    const rows = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, app.applicationId))
    expect(rows.find((c) => c.ruleKey === 'town.bp.expiration')?.currentDue).toBe('2029-03-01')
    const fees = await handle.db
      .select()
      .from(feeAssessments)
      .where(eq(feeAssessments.applicationId, app.applicationId))
    expect(fees).toHaveLength(1)
    expect(fees[0]).toMatchObject({ stage: 'at_renewal', totalCents: 4500 })
  })

  it('renewal uses the town validity period when one is published', async () => {
    await saveAndPublish(handle.db, world.admin, 'town_rule_setting', 'town.bp.validity', {
      ruleKey: 'town.bp.validity',
      value: 18,
      adoptingAuthority: 'Select Board',
      adoptedOn: '2027-01-05',
    })
    const app = await issued()
    expect(await renew(app.applicationId, '2028-03-01')).toEqual({
      ok: true,
      value: { newDue: '2029-09-01' },
    })
  })

  it('two renewals sent at once assess one renewal fee and refuse the other', async () => {
    const app = await issued()
    const results = await Promise.all([
      renew(app.applicationId, '2028-03-01'),
      renew(app.applicationId, '2028-03-01'),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: 'renewal_fee_due' })
    const fees = await handle.db
      .select()
      .from(feeAssessments)
      .where(eq(feeAssessments.applicationId, app.applicationId))
    expect(fees.filter((f) => f.stage === 'at_renewal')).toHaveLength(1)
  })

  it('renewal after the due date is already_lapsed', async () => {
    const app = await issued()
    expect(await renew(app.applicationId, '2028-03-16')).toEqual({
      ok: false,
      error: 'already_lapsed',
    })
  })

  it('renewal on the due date itself is allowed', async () => {
    const app = await issued()
    expect((await renew(app.applicationId, '2028-03-15')).ok).toBe(true)
  })

  it('renewal of a permit that is not issued is not_issued, and a reviewer is forbidden', async () => {
    const app = await makeApplication(handle.db, world, { state: 'decided' })
    expect(await renew(app.applicationId, '2028-03-01')).toEqual({ ok: false, error: 'not_issued' })
    const live = await issued()
    expect(await renew(live.applicationId, '2028-03-01', world.reviewer)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('renewal appears in the clock overrides view as applied', async () => {
    const app = await issued()
    await renew(app.applicationId, '2028-03-01')
    const rows = await listClockAdjustments(handle.db, signal)
    expect(rows.map((r) => ({ kind: r.kind, status: r.status }))).toEqual([
      { kind: 'renewal', status: 'applied' },
    ])
    expect(
      (await handle.db.select().from(applications).where(eq(applications.id, app.applicationId)))[0]
        ?.state,
    ).toBe('issued')
  })

  it('a renewal whose fee cannot be worked out is refused and changes nothing', async () => {
    await saveAndPublish(handle.db, world.admin, 'fee_schedule', 'bp-fees', {
      key: 'bp-fees',
      lines: [
        {
          code: 'renewal',
          label: 'Renewal notice',
          due: 'at_renewal',
          expr: {
            op: 'per_unit',
            source: { kind: 'count_of', what: 'abutters_on_issued_list' },
            centsPerUnit: 500,
          },
        },
      ],
    })
    const app = await issued()
    expect(await renew(app.applicationId, '2028-03-01')).toEqual({
      ok: false,
      error: 'fees_incomplete',
    })
    const rows = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, app.applicationId))
    expect(rows.find((c) => c.ruleKey === 'town.bp.expiration')?.currentDue).toBe('2028-03-15')
    expect(await listClockAdjustments(handle.db, signal)).toEqual([])
  })

  const payRenewal = async (applicationId: string) => {
    const paid = await recordApplicationPayment(
      handle.db,
      world.staff,
      { applicationId, method: 'cash', amountCents: 4500, payerName: 'Pat' },
      signal,
    )
    if (!paid.ok) throw new Error(paid.error)
  }

  it('each renewal charges its own fee: after the first renewal fee is paid, the second renewal owes 4500', async () => {
    const app = await issued()
    expect((await renew(app.applicationId, '2028-03-01')).ok).toBe(true)
    await payRenewal(app.applicationId)
    expect((await feeBalance(handle.db, app.applicationId, signal)).dueCents).toBe(0)
    expect(await renew(app.applicationId, '2029-02-01')).toEqual({
      ok: true,
      value: { newDue: '2030-02-01' },
    })
    const balance = await feeBalance(handle.db, app.applicationId, signal)
    expect(balance.dueCents).toBe(4500)
    expect(balance.lines.find((l) => l.stage === 'at_renewal')).toMatchObject({
      assessedCents: 9000,
      paidCents: 4500,
    })
  })

  it('a renewal while the last renewal fee is unpaid is renewal_fee_due and changes nothing', async () => {
    const app = await issued()
    expect((await renew(app.applicationId, '2028-03-01')).ok).toBe(true)
    expect(await renew(app.applicationId, '2029-02-01')).toEqual({
      ok: false,
      error: 'renewal_fee_due',
    })
    const rows = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, app.applicationId))
    expect(rows.find((c) => c.ruleKey === 'town.bp.expiration')?.currentDue).toBe('2029-03-01')
    expect((await feeBalance(handle.db, app.applicationId, signal)).dueCents).toBe(4500)
  })
})

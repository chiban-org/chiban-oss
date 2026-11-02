import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, clocks } from '@/db/schema'
import { recordAppeal, resolveAppeal } from '@/features/appeals/appeals'
import { isSuspended } from '@/features/appeals/suspension'
import { transitionApplication } from '@/features/applications/transition'
import { startClocksFor } from '@/features/clocks/startClocks'
import { loadPack } from '@/features/packs/loadPack'
import { getParcelHistory } from '@/features/parcels/parcelHistory'
import { clocksDailyJob } from '@/jobs/clocksDaily'
import { runJob } from '@/jobs/defineJob'
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

async function issued() {
  const app = await makeApplication(handle.db, world, { state: 'issued', issuedOn: '2027-03-15' })
  await handle.db.transaction((tx) =>
    startClocksFor(tx, app.applicationId, 'permit_issued', d('2027-03-15'), signal),
  )
  return app
}

const appeal = (applicationId: string, filedOn = '2027-05-01', actor = world.staff) =>
  recordAppeal(
    handle.db,
    actor,
    { applicationId, filedOn: d(filedOn), appellantName: 'Abutter Smith' },
    signal,
  )

const resolve = (
  applicationId: string,
  outcome: 'permit_upheld' | 'permit_revoked',
  resolvedOn = '2027-06-10',
  actor = world.staff,
) => resolveAppeal(handle.db, actor, { applicationId, resolvedOn: d(resolvedOn), outcome }, signal)

async function appRow(applicationId: string) {
  const [row] = await handle.db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
  return row
}

async function expirationClock(applicationId: string) {
  const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, applicationId))
  return rows.find((c) => c.ruleKey === 'town.bp.expiration')
}

describe('recordAppeal', () => {
  it('appeal moves issued to suspended and stops the expiration clock', async () => {
    const app = await issued()
    expect((await appeal(app.applicationId)).ok).toBe(true)
    expect((await appRow(app.applicationId))?.state).toBe('suspended')
    expect((await expirationClock(app.applicationId))?.status).toBe('stopped')
    expect(await isSuspended(handle.db, app.applicationId, signal)).toBe(true)
  })

  it('appeal on a decided application is not_issued', async () => {
    const app = await makeApplication(handle.db, world, { state: 'decided' })
    expect(await appeal(app.applicationId)).toEqual({ ok: false, error: 'not_issued' })
  })

  it('a reviewer cannot record an appeal', async () => {
    const app = await issued()
    expect(await appeal(app.applicationId, '2027-05-01', world.reviewer)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect((await appRow(app.applicationId))?.state).toBe('issued')
  })

  it('suspended permit shows the RSA 676:6 label on public parcel history', async () => {
    const app = await issued()
    await handle.db
      .update(applications)
      .set({ receivedDate: '2027-03-01' })
      .where(eq(applications.id, app.applicationId))
    await appeal(app.applicationId)
    const history = await getParcelHistory(handle.db, world.parcelId, { kind: 'public' }, signal)
    expect(history.own[0]?.status.label).toBe('Suspended by appeal (RSA 676:6)')
  })

  it('daily job never expires a suspended permit', async () => {
    const app = await issued()
    await appeal(app.applicationId)
    await runJob(handle.db, clocksDailyJob, { today: d('2029-01-01') }, signal)
    expect((await appRow(app.applicationId))?.state).toBe('suspended')
  })
})

describe('resolveAppeal', () => {
  it('upheld appeal tolls expiration by suspended days', async () => {
    const app = await issued()
    expect((await expirationClock(app.applicationId))?.currentDue).toBe('2028-03-15')
    await appeal(app.applicationId, '2027-05-01')
    expect((await resolve(app.applicationId, 'permit_upheld', '2027-06-10')).ok).toBe(true)
    const clock = await expirationClock(app.applicationId)
    expect(clock).toMatchObject({
      status: 'running',
      currentDue: '2028-04-24',
      computedDue: '2028-03-15',
    })
    expect((await appRow(app.applicationId))?.state).toBe('issued')
    expect(await isSuspended(handle.db, app.applicationId, signal)).toBe(false)
  })

  it('revoked appeal closes with revoked_on_appeal', async () => {
    const app = await issued()
    await appeal(app.applicationId)
    expect((await resolve(app.applicationId, 'permit_revoked')).ok).toBe(true)
    expect(await appRow(app.applicationId)).toMatchObject({
      state: 'closed',
      closureReason: 'revoked_on_appeal',
    })
  })

  it('closing a suspended application with an unresolved appeal is blocked by nh.appeal.suspension', async () => {
    const app = await issued()
    await appeal(app.applicationId)
    const row = await appRow(app.applicationId)
    const r = await handle.db.transaction((tx) =>
      transitionApplication(
        tx,
        world.staff,
        {
          applicationId: app.applicationId,
          to: 'closed',
          expectedRowVersion: row?.rowVersion ?? 0,
          onDate: d('2027-06-01'),
        },
        signal,
      ),
    )
    expect(r.ok).toBe(false)
    if (!r.ok && typeof r.error === 'object') {
      expect(r.error.gateBlocked.find((g) => g.key === 'nh.appeal.suspension')?.effective).toBe(
        'blocked',
      )
    }
    expect((await appRow(app.applicationId))?.state).toBe('suspended')
  })

  it('resolving without an open appeal, before filing, or without permit.issue is refused', async () => {
    const app = await issued()
    expect(await resolve(app.applicationId, 'permit_upheld')).toEqual({
      ok: false,
      error: 'no_open_appeal',
    })
    await appeal(app.applicationId, '2027-05-01')
    expect(await resolve(app.applicationId, 'permit_upheld', '2027-04-30')).toEqual({
      ok: false,
      error: 'before_filing',
    })
    expect(await resolve(app.applicationId, 'permit_upheld', '2027-06-10', world.reviewer)).toEqual(
      { ok: false, error: 'forbidden' },
    )
  })
})

describe('pack-driven suspension', () => {
  it('an appeal on an application without the suspension binding is recorded but does not suspend', async () => {
    const pack = loadPack()
    const noEffect = {
      ...pack,
      rules: pack.rules.filter((r) => r.kind !== 'effect'),
      classifications: pack.classifications.map((c) => ({
        ...c,
        mandatoryRuleKeys: c.mandatoryRuleKeys.filter((k) => k !== 'nh.appeal.suspension'),
      })),
    }
    const app = await issued()
    const r = await recordAppeal(
      handle.db,
      world.staff,
      {
        applicationId: app.applicationId,
        filedOn: d('2027-05-01'),
        appellantName: 'Abutter Smith',
      },
      signal,
      noEffect,
    )
    expect(r.ok).toBe(true)
    expect((await appRow(app.applicationId))?.state).toBe('issued')
    expect((await expirationClock(app.applicationId))?.status).toBe('running')
    expect(await resolve(app.applicationId, 'permit_upheld')).toEqual({
      ok: true,
      value: undefined,
    })
    expect(await isSuspended(handle.db, app.applicationId, signal)).toBe(false)
  })
})

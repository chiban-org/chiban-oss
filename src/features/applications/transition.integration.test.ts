import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, auditLog, clocks, feeAssessments } from '@/db/schema'
import type { CoreState } from '@/features/applications/states'
import { setSubstep, transitionApplication } from '@/features/applications/transition'
import type { Actor } from '@/features/auth/actor'
import { startClocksFor } from '@/features/clocks/startClocks'
import { applyCondition } from '@/features/conditions/applicationConditions'
import { overrideAdministrativeGate } from '@/features/gates/overrides'
import {
  type ApplicationPatch,
  makeApplication,
  type PermitWorld,
  setupPermitWorld,
} from '@/test/applicationFixtures'
import { appTypeBody, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { insertInspection } from '@/test/inspectionFixtures'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const ON = '2027-03-10' as CivilDate
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, { starters: ['nh.starter.electrical'] })
})
afterEach(async () => {
  await handle.drop()
})

async function go(
  actor: Parameters<typeof transitionApplication>[1],
  applicationId: string,
  to: CoreState,
  expectedRowVersion?: number,
) {
  const [row] = await handle.db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
  return await handle.db.transaction((tx) =>
    transitionApplication(
      tx,
      actor,
      {
        applicationId,
        to,
        expectedRowVersion: expectedRowVersion ?? row?.rowVersion ?? 0,
        onDate: ON,
      },
      signal,
    ),
  )
}

async function stateOf(applicationId: string) {
  const [row] = await handle.db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
  return row
}

async function trade(patch: ApplicationPatch = {}) {
  return await makeApplication(
    handle.db,
    world,
    { values: { description: 'Panel upgrade', contractor_license_number: 'EL-1' }, ...patch },
    undefined,
    'EL',
  )
}

describe('transitions', () => {
  it('trade permit goes submitted to issued in one transition', async () => {
    const app = await trade({ state: 'submitted' })
    const r = await go(world.staff, app.applicationId, 'issued')
    expect(r).toMatchObject({ ok: true, value: { state: 'issued', rowVersion: 2 } })
    expect((await stateOf(app.applicationId))?.issuedOn).toBe(ON)
  })

  it('building permit cannot skip review', async () => {
    const app = await makeApplication(handle.db, world, { state: 'submitted' })
    expect(await go(world.staff, app.applicationId, 'issued')).toEqual({
      ok: false,
      error: 'invalid_transition',
    })
    expect((await stateOf(app.applicationId))?.state).toBe('submitted')
  })

  it('reviewer issuing is forbidden', async () => {
    const app = await trade({ state: 'submitted' })
    expect(await go(world.reviewer, app.applicationId, 'issued')).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('issued to expired by staff is forbidden; by system job succeeds', async () => {
    const app = await trade({ state: 'issued', issuedOn: '2027-03-01' })
    expect(await go(world.staff, app.applicationId, 'expired')).toEqual({
      ok: false,
      error: 'forbidden',
    })
    const system = { kind: 'system' as const, job: 'clocks.daily' }
    expect(await go(system, app.applicationId, 'expired')).toMatchObject({
      ok: true,
      value: { state: 'expired' },
    })
  })

  it('suspended is reachable only through the appeal path', async () => {
    const app = await trade({ state: 'issued' })
    expect(await go(world.staff, app.applicationId, 'suspended')).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('stale row version is refused', async () => {
    const app = await trade({ state: 'submitted' })
    expect(await go(world.staff, app.applicationId, 'issued', 7)).toEqual({
      ok: false,
      error: 'stale_version',
    })
    expect((await stateOf(app.applicationId))?.state).toBe('submitted')
  })

  it('withdrawing needs an applicant party or staff', async () => {
    const app = await trade({ state: 'submitted' })
    const outsider = world.reviewer
    expect(await go(outsider, app.applicationId, 'withdrawn')).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await go(world.applicant, app.applicationId, 'withdrawn')).toMatchObject({ ok: true })
  })

  it('a terminal state accepts no transition and stops running clocks', async () => {
    const app = await makeApplication(handle.db, world, { state: 'issued' })
    await handle.db.transaction((tx) =>
      startClocksFor(tx, app.applicationId, 'permit_issued', ON, signal),
    )
    await overrideAdministrativeGate(
      handle.db,
      world.staff,
      {
        applicationId: app.applicationId,
        gateKey: 'closure.requirement_met',
        reason: 'Work abandoned before the final inspection.',
      },
      signal,
    )
    expect(await go(world.staff, app.applicationId, 'closed')).toMatchObject({ ok: true })
    expect(await go(world.staff, app.applicationId, 'issued')).toEqual({
      ok: false,
      error: 'invalid_transition',
    })
    const rows = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, app.applicationId))
    expect(rows.every((c) => c.status === 'stopped')).toBe(true)
  })

  it('blocked gate returns gateBlocked and leaves state unchanged', async () => {
    const app = await trade({ state: 'submitted' })
    await applyCondition(
      handle.db,
      world.staff,
      { applicationId: app.applicationId, code: 'LICENSE' },
      signal,
    )
    const r = await go(world.staff, app.applicationId, 'issued')
    expect(r.ok).toBe(false)
    if (!r.ok && typeof r.error === 'object') {
      expect(r.error.gateBlocked.find((g) => g.key === 'conditions.blocking_met')?.effective).toBe(
        'blocked',
      )
    }
    expect((await stateOf(app.applicationId))?.state).toBe('submitted')
    expect((await stateOf(app.applicationId))?.rowVersion).toBe(1)
  })

  it('every transition writes an audit row', async () => {
    const app = await trade({ state: 'submitted' })
    await go(world.staff, app.applicationId, 'issued')
    const rows = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'application.transition'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.before).toMatchObject({ state: 'submitted' })
    expect(rows[0]?.after).toMatchObject({ state: 'issued' })
  })

  it('closing records the closure reason', async () => {
    const app = await trade({ state: 'issued' })
    const [row] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, app.applicationId))
    const r = await handle.db.transaction((tx) =>
      transitionApplication(
        tx,
        world.staff,
        {
          applicationId: app.applicationId,
          to: 'closed',
          closureReason: 'final_inspection_passed',
          expectedRowVersion: row?.rowVersion ?? 0,
          onDate: ON,
        },
        signal,
      ),
    )
    expect(r.ok).toBe(true)
    expect((await stateOf(app.applicationId))?.closureReason).toBe('final_inspection_passed')
  })

  it('an inspector may close a permit but finance may not', async () => {
    const inspector = await staffActor(handle.db, 'inspector')
    const finance = await staffActor(handle.db, 'finance')
    const first = await trade({ state: 'issued' })
    const second = await trade({ state: 'issued' })
    await insertInspection(handle.db, second.applicationId, 'final', { status: 'passed' })
    expect(await go(finance, first.applicationId, 'closed')).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await go(inspector, second.applicationId, 'closed')).toMatchObject({ ok: true })
  })

  it('a trade permit closes by hand only once its final inspection has passed', async () => {
    const app = await trade({ state: 'issued' })
    const blocked = await go(world.staff, app.applicationId, 'closed')
    expect(blocked.ok).toBe(false)
    const results =
      !blocked.ok && typeof blocked.error === 'object' ? blocked.error.gateBlocked : []
    expect(results.find((g) => g.key === 'closure.requirement_met')).toMatchObject({
      kind: 'administrative',
      effective: 'blocked',
      outcome: { status: 'blocked', reason: 'No final inspection has passed.' },
    })
    await insertInspection(handle.db, app.applicationId, 'final', { status: 'passed' })
    expect(await go(world.staff, app.applicationId, 'closed')).toMatchObject({ ok: true })
  })

  it('a building permit closes by hand only with a certificate of occupancy or an override', async () => {
    const app = await makeApplication(handle.db, world, { state: 'issued' })
    const blocked = await go(world.staff, app.applicationId, 'closed')
    const results =
      !blocked.ok && typeof blocked.error === 'object' ? blocked.error.gateBlocked : []
    expect(results.find((g) => g.key === 'closure.requirement_met')?.outcome).toEqual({
      status: 'blocked',
      reason: 'No certificate of occupancy has been issued.',
    })
    expect(
      await overrideAdministrativeGate(
        handle.db,
        world.staff,
        {
          applicationId: app.applicationId,
          gateKey: 'closure.requirement_met',
          reason: 'Owner abandoned the project; permit closed unfinished.',
        },
        signal,
      ),
    ).toMatchObject({ ok: true })
    expect(await go(world.staff, app.applicationId, 'closed')).toMatchObject({ ok: true })
  })
})

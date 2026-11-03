import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applicationConditions } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { applyCondition, setConditionStatus } from '@/features/conditions/applicationConditions'
import { evaluateGates } from '@/features/gates/evaluateGates'
import {
  overrideAdministrativeGate,
  recordStatutoryException,
  revokeGateOverride,
} from '@/features/gates/overrides'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const TODAY = '2027-03-10' as CivilDate
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function gates(applicationId: string) {
  const app = await loadApplicationContext(handle.db, applicationId, signal)
  if (app === null) throw new Error('no app')
  return await handle.db.transaction((tx) => evaluateGates(tx, app, 'issued', TODAY, signal))
}

const effectiveOf = (results: Awaited<ReturnType<typeof gates>>, key: string) =>
  results.find((r) => r.key === key)?.effective

async function blockingCondition(applicationId: string) {
  const r = await applyCondition(handle.db, world.staff, { applicationId, code: 'SEPTIC' }, signal)
  if (!r.ok) throw new Error('apply failed')
  return r.value.conditionId
}

describe('conditions gate', () => {
  it('unmet blocking condition blocks issuance', async () => {
    const app = await makeApplication(handle.db, world)
    await blockingCondition(app.applicationId)
    const results = await gates(app.applicationId)
    expect(effectiveOf(results, 'conditions.blocking_met')).toBe('blocked')
    expect(results.find((r) => r.key === 'conditions.blocking_met')?.outcome).toMatchObject({
      status: 'blocked',
    })
  })

  it('the blocked reason names the condition text, not its code', async () => {
    const app = await makeApplication(handle.db, world)
    await blockingCondition(app.applicationId)
    const reason = (await gates(app.applicationId)).find((r) => r.key === 'conditions.blocking_met')
    expect(reason?.outcome).toMatchObject({
      status: 'blocked',
      reason: 'Unmet conditions block issuance: Approved septic design on file.',
    })
  })

  it('a condition whose text ends in a period is not followed by a second one', async () => {
    const app = await makeApplication(handle.db, world)
    const id = await blockingCondition(app.applicationId)
    await handle.db
      .update(applicationConditions)
      .set({ textSnapshot: 'Approved septic design on file.' })
      .where(eq(applicationConditions.id, id))
    const reason = (await gates(app.applicationId)).find((r) => r.key === 'conditions.blocking_met')
    expect(reason?.outcome).toMatchObject({
      reason: 'Unmet conditions block issuance: Approved septic design on file.',
    })
  })

  it('no conditions passes, and a met condition passes', async () => {
    const app = await makeApplication(handle.db, world)
    expect(effectiveOf(await gates(app.applicationId), 'conditions.blocking_met')).toBe('pass')
    const id = await blockingCondition(app.applicationId)
    await setConditionStatus(handle.db, world.staff, { conditionId: id, status: 'met' }, signal)
    expect(effectiveOf(await gates(app.applicationId), 'conditions.blocking_met')).toBe('pass')
  })

  it('waiving a blocking condition needs gate.override_admin and a reason', async () => {
    const app = await makeApplication(handle.db, world)
    const id = await blockingCondition(app.applicationId)
    expect(
      await setConditionStatus(
        handle.db,
        world.reviewer,
        { conditionId: id, status: 'waived', reason: 'Owner letter on file' },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
    expect(
      await setConditionStatus(
        handle.db,
        world.staff,
        { conditionId: id, status: 'waived' },
        signal,
      ),
    ).toEqual({ ok: false, error: 'reason_required' })
    expect(
      (
        await setConditionStatus(
          handle.db,
          world.staff,
          { conditionId: id, status: 'waived', reason: 'Owner letter on file' },
          signal,
        )
      ).ok,
    ).toBe(true)
    expect(effectiveOf(await gates(app.applicationId), 'conditions.blocking_met')).toBe('pass')
  })

  it('applying a condition not in the pinned library is unknown_condition', async () => {
    const app = await makeApplication(handle.db, world)
    expect(
      await applyCondition(
        handle.db,
        world.staff,
        { applicationId: app.applicationId, code: 'NOPE' },
        signal,
      ),
    ).toEqual({ ok: false, error: 'unknown_condition' })
  })
})

describe('administrative overrides', () => {
  it('administrative override with reason lets issuance pass and records the reason', async () => {
    const app = await makeApplication(handle.db, world)
    await blockingCondition(app.applicationId)
    const r = await overrideAdministrativeGate(
      handle.db,
      world.staff,
      {
        applicationId: app.applicationId,
        gateKey: 'conditions.blocking_met',
        reason: 'Septic design approved by letter',
      },
      signal,
    )
    expect(r.ok).toBe(true)
    const result = (await gates(app.applicationId)).find((g) => g.key === 'conditions.blocking_met')
    expect(result?.effective).toBe('pass')
    expect(result?.override).toMatchObject({
      kind: 'administrative_override',
      reason: 'Septic design approved by letter',
    })
  })

  it('override without reason is reason_required', async () => {
    const app = await makeApplication(handle.db, world)
    for (const reason of ['', '   ', 'too short']) {
      expect(
        await overrideAdministrativeGate(
          handle.db,
          world.staff,
          { applicationId: app.applicationId, gateKey: 'conditions.blocking_met', reason },
          signal,
        ),
      ).toEqual({ ok: false, error: 'reason_required' })
    }
  })

  it('a reviewer cannot override and an unknown gate is unknown_gate', async () => {
    const app = await makeApplication(handle.db, world)
    const input = {
      applicationId: app.applicationId,
      gateKey: 'conditions.blocking_met',
      reason: 'Septic design approved',
    }
    expect(await overrideAdministrativeGate(handle.db, world.reviewer, input, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(
      await overrideAdministrativeGate(
        handle.db,
        world.staff,
        { ...input, gateKey: 'nope' },
        signal,
      ),
    ).toEqual({ ok: false, error: 'unknown_gate' })
  })

  it('revoked override no longer applies', async () => {
    const app = await makeApplication(handle.db, world)
    await blockingCondition(app.applicationId)
    await overrideAdministrativeGate(
      handle.db,
      world.staff,
      {
        applicationId: app.applicationId,
        gateKey: 'conditions.blocking_met',
        reason: 'Septic design approved',
      },
      signal,
    )
    const applied = (await gates(app.applicationId)).find(
      (g) => g.key === 'conditions.blocking_met',
    )
    expect(applied?.override).not.toBeNull()
    expect(
      await revokeGateOverride(handle.db, world.staff, applied?.override?.id ?? '', signal),
    ).toEqual({ ok: true, value: undefined })
    expect(effectiveOf(await gates(app.applicationId), 'conditions.blocking_met')).toBe('blocked')
  })
})

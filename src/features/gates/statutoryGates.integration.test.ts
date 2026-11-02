import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadApplicationContext } from '@/features/applications/context'
import { applyCondition, setConditionStatus } from '@/features/conditions/applicationConditions'
import { evaluateGates } from '@/features/gates/evaluateGates'
import {
  overrideAdministrativeGate,
  recordStatutoryException,
  revokeGateOverride,
} from '@/features/gates/overrides'
import type { GateOutcome } from '@/features/gates/registry'
import { registerGate } from '@/features/gates/registry'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const TODAY = '2027-03-10' as CivilDate
let handle: TestDb
let world: PermitWorld
let statutoryOutcome: GateOutcome = { status: 'pass' }

registerGate({
  key: 'test.statutory',
  kind: 'statutory',
  appliesTo: ['issued'],
  boundBy: null,
  evaluate: () => Promise.resolve(statutoryOutcome),
})
registerGate({
  key: 'test.unbound',
  kind: 'statutory',
  appliesTo: ['issued'],
  boundBy: 'nh.not.in.bindings',
  evaluate: () => Promise.resolve({ status: 'blocked', reason: 'should not run' }),
})

beforeEach(async () => {
  statutoryOutcome = { status: 'pass' }
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

describe('statutory gates', () => {
  const authority = {
    citation: 'RSA 676:5',
    explanation: 'Board of adjustment order dated 2027-03-01',
  }

  it('statutory gate refuses a reason-only override', async () => {
    const app = await makeApplication(handle.db, world)
    statutoryOutcome = { status: 'blocked', reason: 'Closed' }
    expect(
      await overrideAdministrativeGate(
        handle.db,
        world.staff,
        {
          applicationId: app.applicationId,
          gateKey: 'test.statutory',
          reason: 'Please let it through',
        },
        signal,
      ),
    ).toEqual({ ok: false, error: 'statutory_requires_authority' })
    expect(effectiveOf(await gates(app.applicationId), 'test.statutory')).toBe('blocked')
  })

  it('staff recording a statutory exception is forbidden', async () => {
    const app = await makeApplication(handle.db, world)
    expect(
      await recordStatutoryException(
        handle.db,
        world.staff,
        { applicationId: app.applicationId, gateKey: 'test.statutory', legalAuthority: authority },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
  })

  it('admin statutory exception without citation is authority_required', async () => {
    const app = await makeApplication(handle.db, world)
    for (const legalAuthority of [
      { citation: '', explanation: 'x' },
      { citation: 'RSA 1', explanation: ' ' },
    ]) {
      expect(
        await recordStatutoryException(
          handle.db,
          world.admin,
          { applicationId: app.applicationId, gateKey: 'test.statutory', legalAuthority },
          signal,
        ),
      ).toEqual({ ok: false, error: 'authority_required' })
    }
  })

  it('admin statutory exception with citation passes and the gate result shows the authority', async () => {
    const app = await makeApplication(handle.db, world)
    statutoryOutcome = { status: 'blocked', reason: 'Closed' }
    const r = await recordStatutoryException(
      handle.db,
      world.admin,
      { applicationId: app.applicationId, gateKey: 'test.statutory', legalAuthority: authority },
      signal,
    )
    expect(r.ok).toBe(true)
    const result = (await gates(app.applicationId)).find((g) => g.key === 'test.statutory')
    expect(result?.effective).toBe('pass')
    expect(result?.override?.legalAuthority).toEqual(authority)
  })

  it('a statutory exception on an administrative gate is not_statutory', async () => {
    const app = await makeApplication(handle.db, world)
    expect(
      await recordStatutoryException(
        handle.db,
        world.admin,
        {
          applicationId: app.applicationId,
          gateKey: 'conditions.blocking_met',
          legalAuthority: authority,
        },
        signal,
      ),
    ).toEqual({ ok: false, error: 'not_statutory' })
  })

  it('unknown outcome blocks', async () => {
    const app = await makeApplication(handle.db, world)
    statutoryOutcome = { status: 'unknown', reason: 'Not recorded' }
    expect(effectiveOf(await gates(app.applicationId), 'test.statutory')).toBe('blocked')
  })

  it('gate bound to a rule outside effective bindings is not evaluated', async () => {
    const app = await makeApplication(handle.db, world)
    const results = await gates(app.applicationId)
    expect(results.map((r) => r.key)).not.toContain('test.unbound')
  })
})

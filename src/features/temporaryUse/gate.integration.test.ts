import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadApplicationContext } from '@/features/applications/context'
import { evaluateGates } from '@/features/gates/evaluateGates'
import { TEMPORARY_USE_GATE_KEY } from '@/features/temporaryUse/gate'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const TODAY = '2027-06-01' as CivilDate
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, {
    starters: ['nh.starter.temporary_use', 'nh.starter.temporary_structure'],
  })
})
afterEach(async () => {
  await handle.drop()
})

async function tempUse(values: Record<string, string>, state: 'draft' | 'issued' = 'draft') {
  return await makeApplication(handle.db, world, { values, state }, undefined, 'TUP')
}

async function gateFor(applicationId: string) {
  const app = await loadApplicationContext(handle.db, applicationId, signal)
  if (app === null) throw new Error('no app')
  const results = await handle.db.transaction((tx) =>
    evaluateGates(tx, app, 'submitted', TODAY, signal),
  )
  return results.find((r) => r.key === TEMPORARY_USE_GATE_KEY)
}

describe('temporary use gate', () => {
  it('passes a three day use filed 14 days ahead', async () => {
    const app = await tempUse({ start_date: '2027-06-15', end_date: '2027-06-17' })
    expect((await gateFor(app.applicationId))?.effective).toBe('pass')
  })

  it('blocks a long use filed late with a reason that names both limits', async () => {
    const app = await tempUse({ start_date: '2027-06-05', end_date: '2027-06-09' })
    const gate = await gateFor(app.applicationId)
    expect(gate?.effective).toBe('blocked')
    const reason = gate?.outcome.status === 'blocked' ? gate.outcome.reason : ''
    expect(reason).toContain('at most 3 consecutive days in any 30-day period')
    expect(reason).toContain('File at least 14 days before the start date')
  })

  it('blocks a second use on the same parcel inside one 30-day period', async () => {
    await tempUse({ start_date: '2027-07-10', end_date: '2027-07-11' }, 'issued')
    const app = await tempUse({ start_date: '2027-06-20', end_date: '2027-06-21' })
    const gate = await gateFor(app.applicationId)
    expect(gate?.effective).toBe('blocked')
  })

  it('ignores a draft on the same parcel and a temporary structure permit', async () => {
    await tempUse({ start_date: '2027-07-10', end_date: '2027-07-11' })
    await makeApplication(
      handle.db,
      world,
      { values: { start_date: '2027-06-22', end_date: '2027-06-23' }, state: 'issued' },
      undefined,
      'TS',
    )
    const app = await tempUse({ start_date: '2027-06-20', end_date: '2027-06-21' })
    expect((await gateFor(app.applicationId))?.effective).toBe('pass')
  })

  it('does not apply to other application types', async () => {
    const app = await makeApplication(handle.db, world, {}, undefined, 'TS')
    expect(await gateFor(app.applicationId)).toBeUndefined()
  })
})

import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications } from '@/db/schema'
import { applyCondition, setConditionStatus } from '@/features/conditions/applicationConditions'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function applied(applicationId: string) {
  const r = await applyCondition(handle.db, world.staff, { applicationId, code: 'SEPTIC' }, signal)
  if (!r.ok) throw new Error(`apply failed: ${r.error}`)
  return r.value.conditionId
}

describe('who may change conditions', () => {
  it('finance and inspector roles cannot apply a condition', async () => {
    const app = await makeApplication(handle.db, world, { state: 'under_review' })
    for (const role of ['finance', 'inspector'] as const) {
      const actor = await staffActor(handle.db, role)
      expect(
        await applyCondition(
          handle.db,
          actor,
          { applicationId: app.applicationId, code: 'SEPTIC' },
          signal,
        ),
      ).toEqual({ ok: false, error: 'forbidden' })
    }
  })

  it('finance and inspector roles cannot mark a condition met', async () => {
    const app = await makeApplication(handle.db, world, { state: 'under_review' })
    const conditionId = await applied(app.applicationId)
    for (const role of ['finance', 'inspector'] as const) {
      const actor = await staffActor(handle.db, role)
      expect(
        await setConditionStatus(handle.db, actor, { conditionId, status: 'met' }, signal),
      ).toEqual({ ok: false, error: 'forbidden' })
    }
  })

  it('a closed application takes no new condition and no status change', async () => {
    const app = await makeApplication(handle.db, world, { state: 'issued' })
    const conditionId = await applied(app.applicationId)
    await handle.db
      .update(applications)
      .set({ state: 'closed' })
      .where(eq(applications.id, app.applicationId))
    expect(
      await applyCondition(
        handle.db,
        world.staff,
        { applicationId: app.applicationId, code: 'SEPTIC' },
        signal,
      ),
    ).toEqual({ ok: false, error: 'application_closed' })
    expect(
      await setConditionStatus(handle.db, world.staff, { conditionId, status: 'met' }, signal),
    ).toEqual({ ok: false, error: 'application_closed' })
  })
})

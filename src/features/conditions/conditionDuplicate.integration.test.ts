import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applicationConditions } from '@/db/schema'
import { applyCondition, setConditionStatus } from '@/features/conditions/applicationConditions'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

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

async function rowsFor(applicationId: string) {
  return await handle.db
    .select({ code: applicationConditions.code, status: applicationConditions.status })
    .from(applicationConditions)
    .where(eq(applicationConditions.applicationId, applicationId))
}

describe('applying the same condition twice', () => {
  it('refuses the second application and leaves one row', async () => {
    const app = await makeApplication(handle.db, world, { state: 'under_review' })
    const input = { applicationId: app.applicationId, code: 'SEPTIC' }
    expect((await applyCondition(handle.db, world.staff, input, signal)).ok).toBe(true)
    expect(await applyCondition(handle.db, world.staff, input, signal)).toEqual({
      ok: false,
      error: 'already_applied',
    })
    expect(await rowsFor(app.applicationId)).toEqual([{ code: 'SEPTIC', status: 'unmet' }])
  })

  it('still refuses once the condition has been marked met', async () => {
    const app = await makeApplication(handle.db, world, { state: 'under_review' })
    const input = { applicationId: app.applicationId, code: 'SEPTIC' }
    const first = await applyCondition(handle.db, world.staff, input, signal)
    if (!first.ok) throw new Error(first.error)
    await setConditionStatus(
      handle.db,
      world.staff,
      { conditionId: first.value.conditionId, status: 'met' },
      signal,
    )
    expect(await applyCondition(handle.db, world.staff, input, signal)).toEqual({
      ok: false,
      error: 'already_applied',
    })
    expect(await rowsFor(app.applicationId)).toEqual([{ code: 'SEPTIC', status: 'met' }])
  })

  it('creates one row when two requests race', async () => {
    const app = await makeApplication(handle.db, world, { state: 'under_review' })
    const input = { applicationId: app.applicationId, code: 'SEPTIC' }
    const results = await Promise.all([
      applyCondition(handle.db, world.staff, input, signal),
      applyCondition(handle.db, world.staff, input, signal),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(await rowsFor(app.applicationId)).toHaveLength(1)
  })
})

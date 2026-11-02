import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { feeAssessments } from '@/db/schema'
import { assessFees } from '@/features/fees/assess'
import { createFeeOverride } from '@/features/fees/feeOverrides'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { FEE_BODY, saveAndPublish } from '@/test/configFixtures'
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

async function assess(
  applicationId: string,
  stage: 'at_intake' | 'at_approval' | 'at_renewal' = 'at_approval',
) {
  return await handle.db.transaction((tx) =>
    assessFees(tx, applicationId, stage, world.staff, signal),
  )
}

describe('assessFees', () => {
  it('at_approval assessment stores the computation and total', async () => {
    const app = await makeApplication(handle.db, world, {
      values: { finished_sq_ft: '100' },
      facts: { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
    })
    const r = await assess(app.applicationId)
    expect(r.ok && r.value.totalCents).toBe(3500)
    const rows = await handle.db
      .select()
      .from(feeAssessments)
      .where(eq(feeAssessments.applicationId, app.applicationId))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ stage: 'at_approval', sequence: 1, totalCents: 3500 })
    expect((rows[0]?.computation as { complete: boolean }).complete).toBe(true)
  })

  it('pinned schedule prices at v1 after v2 publishes', async () => {
    const app = await makeApplication(handle.db, world, { values: { finished_sq_ft: '100' } })
    await saveAndPublish(handle.db, world.admin, 'fee_schedule', 'bp-fees', {
      ...FEE_BODY,
      lines: [
        {
          ...FEE_BODY.lines[0],
          expr: {
            op: 'per_unit',
            source: { kind: 'field', field: 'finished_sq_ft' },
            centsPerUnit: 99,
          },
        },
      ],
    })
    const r = await assess(app.applicationId)
    expect(r.ok && r.value.totalCents).toBe(3500)
    const fresh = await makeApplication(handle.db, world, { values: { finished_sq_ft: '100' } })
    const second = await assess(fresh.applicationId)
    expect(second.ok && second.value.totalCents).toBe(9900)
  })

  it('each assessment is a new sequence for the same stage', async () => {
    const app = await makeApplication(handle.db, world, { values: { finished_sq_ft: '100' } })
    await assess(app.applicationId)
    await assess(app.applicationId)
    const rows = await handle.db
      .select()
      .from(feeAssessments)
      .where(eq(feeAssessments.applicationId, app.applicationId))
    expect(rows.map((r) => r.sequence).sort()).toEqual([1, 2])
  })

  it('unknown abutter count makes assessment incomplete and stores nothing', async () => {
    const app = await makeApplication(handle.db, world)
    await saveAndPublish(handle.db, world.admin, 'fee_schedule', 'bp-fees', {
      ...FEE_BODY,
      lines: [
        {
          code: 'notice',
          label: 'Abutter notice',
          due: 'at_approval',
          expr: {
            op: 'per_unit',
            source: { kind: 'count_of', what: 'abutters_on_issued_list' },
            centsPerUnit: 800,
          },
        },
      ],
    })
    const pinned = await makeApplication(handle.db, world)
    const r = await assess(pinned.applicationId)
    expect(r).toEqual({ ok: false, error: 'incomplete' })
    expect(await handle.db.select().from(feeAssessments)).toHaveLength(0)
    expect(app.applicationId).not.toBe(pinned.applicationId)
  })

  it('override applies at the next assessment', async () => {
    const app = await makeApplication(handle.db, world, { values: { finished_sq_ft: '100' } })
    const made = await createFeeOverride(
      handle.db,
      world.staff,
      {
        applicationId: app.applicationId,
        feeCode: 'building',
        kind: 'waive',
        reason: 'Town-owned building',
      },
      signal,
    )
    expect(made.ok).toBe(true)
    const r = await assess(app.applicationId)
    expect(r.ok && r.value.totalCents).toBe(0)
    const [row] = await handle.db
      .select()
      .from(feeAssessments)
      .where(eq(feeAssessments.applicationId, app.applicationId))
    const line = (
      row?.computation as { lines: { amount: { source: string; replaced: { value: number } } }[] }
    ).lines[0]
    expect(line?.amount.source).toBe('manual_override')
    expect(line?.amount.replaced.value).toBe(3500)
  })

  it('an unknown application is a programmer error', async () => {
    await expect(assess('00000000-0000-4000-8000-000000000000')).rejects.toThrow()
  })
})

import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications } from '@/db/schema'
import { createFeeOverride, listFeeOverrides } from '@/features/fees/feeOverrides'
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

const waive = (applicationId: string, feeCode = 'building') => ({
  applicationId,
  feeCode,
  kind: 'waive' as const,
  reason: 'Town-owned building',
})

describe('fee overrides', () => {
  it('override on a code the schedule lacks lists as no_match', async () => {
    const app = await makeApplication(handle.db, world)
    await createFeeOverride(handle.db, world.staff, waive(app.applicationId, 'ghost'), signal)
    const rows = await listFeeOverrides(handle.db, signal)
    expect(rows.map((r) => r.status)).toEqual(['no_match'])
  })

  it('an override on a real code lists as applied', async () => {
    const app = await makeApplication(handle.db, world)
    await createFeeOverride(handle.db, world.staff, waive(app.applicationId), signal)
    expect((await listFeeOverrides(handle.db, signal)).map((r) => r.status)).toEqual(['applied'])
  })

  it('second override supersedes the first', async () => {
    const app = await makeApplication(handle.db, world)
    await createFeeOverride(handle.db, world.staff, waive(app.applicationId), signal)
    await createFeeOverride(
      handle.db,
      world.staff,
      {
        applicationId: app.applicationId,
        feeCode: 'building',
        kind: 'set_amount',
        amountCents: 1000,
        reason: 'Hardship',
      },
      signal,
    )
    const rows = await listFeeOverrides(handle.db, signal)
    expect(rows.map((r) => r.status).sort()).toEqual(['applied', 'superseded'])
  })

  it('override on a withdrawn application lists as expired', async () => {
    const app = await makeApplication(handle.db, world)
    await createFeeOverride(handle.db, world.staff, waive(app.applicationId), signal)
    await handle.db
      .update(applications)
      .set({ state: 'withdrawn' })
      .where(eq(applications.id, app.applicationId))
    expect((await listFeeOverrides(handle.db, signal)).map((r) => r.status)).toEqual(['expired'])
  })

  it('reviewer creating an override gets forbidden', async () => {
    const app = await makeApplication(handle.db, world)
    expect(
      await createFeeOverride(handle.db, world.reviewer, waive(app.applicationId), signal),
    ).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('override without reason is reason_required', async () => {
    const app = await makeApplication(handle.db, world)
    expect(
      await createFeeOverride(
        handle.db,
        world.staff,
        { ...waive(app.applicationId), reason: '   ' },
        signal,
      ),
    ).toEqual({ ok: false, error: 'reason_required' })
  })

  it('set_amount without an amount is amount_required and an unknown application is not_found', async () => {
    const app = await makeApplication(handle.db, world)
    expect(
      await createFeeOverride(
        handle.db,
        world.staff,
        { applicationId: app.applicationId, feeCode: 'building', kind: 'set_amount', reason: 'x' },
        signal,
      ),
    ).toEqual({ ok: false, error: 'amount_required' })
    expect(
      await createFeeOverride(
        handle.db,
        world.staff,
        waive('00000000-0000-4000-8000-000000000000'),
        signal,
      ),
    ).toEqual({ ok: false, error: 'not_found' })
  })
})

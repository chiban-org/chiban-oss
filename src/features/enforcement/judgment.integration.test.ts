import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enforcementCases, enforcementOrders, orderCourtSteps } from '@/db/schema'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  completeService,
  type EnforcementWorld,
  type IssuedOrder,
  issuedOrder,
  makeStepper,
  setupEnforcementWorld,
} from '@/test/enforcementFixtures'
import { makeTestStore } from '@/test/objectStore'

const LATER = new Date('2027-07-20T15:00:00Z')
let handle: TestDb
let store: ObjectStore
let world: EnforcementWorld
let order: IssuedOrder
let step: ReturnType<typeof makeStepper>

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  world = await setupEnforcementWorld(handle.db)
  order = await issuedOrder(handle.db, store, world)
  step = makeStepper(handle.db, store, world, order, LATER)
  await completeService(handle.db, store, world, order, '2027-03-01')
  await step('filed_with_clerk', '2027-03-10')
  await step('motion_to_enforce', '2027-03-23')
})
afterEach(async () => {
  await handle.drop()
})

async function orderStatus() {
  const [row] = await handle.db
    .select()
    .from(enforcementOrders)
    .where(eq(enforcementOrders.id, order.orderId))
  return row?.status
}

describe('court judgment', () => {
  it('judgment on 2027-06-18 stores appeal due 2027-07-06', async () => {
    const judgment = await step('judgment', '2027-06-18', { judgmentOutcome: 'affirmed' })
    if (!judgment.ok) throw new Error(JSON.stringify(judgment.error))
    const [stored] = await handle.db
      .select()
      .from(orderCourtSteps)
      .where(eq(orderCourtSteps.id, judgment.value.stepId))
    expect(stored?.appealDue).toMatchObject({ due: '2027-07-06', rolledFrom: '2027-07-03' })
    expect(await orderStatus()).toBe('judgment')
    const [kase] = await handle.db
      .select()
      .from(enforcementCases)
      .where(eq(enforcementCases.id, order.caseId))
    expect(kase?.status).toBe('in_court')
  })

  it('a judgment that annuls the order marks it annulled', async () => {
    await step('judgment', '2027-06-18', { judgmentOutcome: 'annulled' })
    expect(await orderStatus()).toBe('annulled')
  })

  it('a judgment without an outcome is invalid', async () => {
    expect(await step('judgment', '2027-06-18')).toEqual({ ok: false, error: 'invalid' })
  })

  it('a judgment before the motion was filed is motion_required', async () => {
    const other = await issuedOrder(handle.db, store, world, { location: '3 Oak Street' })
    const stepOther = makeStepper(handle.db, store, world, other, LATER)
    expect(await stepOther('judgment', '2027-06-18', { judgmentOutcome: 'affirmed' })).toEqual({
      ok: false,
      error: 'motion_required',
    })
  })

  it('a judgment dated before the motion is date_before_motion', async () => {
    expect(await step('judgment', '2027-03-01', { judgmentOutcome: 'affirmed' })).toEqual({
      ok: false,
      error: 'date_before_motion',
    })
  })

  it('an annulled order accepts no further court step', async () => {
    await step('judgment', '2027-06-18', { judgmentOutcome: 'annulled' })
    expect(await step('filed_with_clerk', '2027-06-20')).toEqual({
      ok: false,
      error: 'order_not_active',
    })
  })
})

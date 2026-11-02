import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { paymentAttempts } from '@/db/schema'
import { voidAttempt } from '@/features/payments/attemptActions'
import { makeTestDb, type TestDb } from '@/test/db'
import { createFakeProcessor } from '@/test/fakes/fakeProcessor'
import { setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'
import { makeCardAttempt, processorState, setupPayments } from '@/test/paymentFixtures'

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
})
afterAll(async () => {
  await handle.drop()
})

describe('voiding an attempt whose processor object belongs to another account', () => {
  it('reports the foreign object instead of claiming a payment was recorded', async () => {
    const { world } = await setupTradeWorld(handle.db)
    const trade = await submittedTrade(handle.db, world)
    await setupPayments(handle.db, world.admin)
    const { attemptId } = await makeCardAttempt(handle.db, trade)
    await handle.db
      .update(paymentAttempts)
      .set({ state: 'authorized', processorObjectId: 'pi_foreign' })
      .where(eq(paymentAttempts.id, attemptId))
    const fake = createFakeProcessor()
    fake.setState(
      'pi_foreign',
      processorState({ objectId: 'pi_foreign', accountRef: 'acct_other' }),
    )
    const finance = await staffActor(handle.db, 'finance')
    const result = await voidAttempt(
      handle.db,
      finance,
      { attemptId, reason: 'Customer asked to cancel' },
      signal,
      { processorFactory: () => fake },
    )
    expect(result).toEqual({ ok: false, error: 'foreign_object' })
  })
})

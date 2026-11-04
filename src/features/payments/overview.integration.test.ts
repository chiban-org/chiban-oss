import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { paymentAttempts, processorAccounts } from '@/db/schema'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { loadPaymentsOverview } from '@/features/payments/overview'
import { reconcileAttempt } from '@/features/payments/reconcileAttempt'
import { loadProcessorSettings } from '@/features/payments/settingsView'
import type { PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { lineAllocation, setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'
import { makeCardAttempt, processorState, setupPayments } from '@/test/paymentFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const TODAY = '2027-03-02' as CivilDate
const NOW = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = (await setupTradeWorld(handle.db)).world
  await setupPayments(handle.db, world.admin)
})
afterAll(async () => {
  await handle.drop()
})

describe('page loaders', () => {
  it('payments page loader lists the unknown attempt and the overpayment', async () => {
    const other = await submittedTrade(handle.db, world)
    const { attemptId } = await makeCardAttempt(handle.db, other)
    await handle.db
      .update(paymentAttempts)
      .set({ outcomeUnknown: true, anomaly: 'amount_mismatch', processorObjectId: 'pi_u' })
      .where(eq(paymentAttempts.id, attemptId))
    const over = await submittedTrade(handle.db, world)
    const cash = await recordCounterPayment(
      handle.db,
      world.staff,
      {
        method: 'cash',
        amountCents: 4500,
        payerName: 'Pat',
        allocations: [lineAllocation(over, 4500)],
      },
      signal,
      NOW,
    )
    if (!cash.ok) throw new Error(cash.error)
    const overview = await loadPaymentsOverview(handle.db, world.staff, { date: TODAY }, signal)
    if (!overview.ok) throw new Error(overview.error)
    expect(overview.value.unknownAttempts.map((a) => a.id)).toContain(attemptId)
    expect(overview.value.anomalies.map((a) => a.id)).toContain(attemptId)
    expect(overview.value.entries.length).toBeGreaterThan(0)
  })

  it('an open overpayment is listed with its application', async () => {
    const over = await submittedTrade(handle.db, world)
    const { attemptId } = await makeCardAttempt(handle.db, over)
    const cash = await recordCounterPayment(
      handle.db,
      world.staff,
      {
        method: 'cash',
        amountCents: 4500,
        payerName: 'Pat',
        allocations: [lineAllocation(over, 4500)],
      },
      signal,
      NOW,
    )
    expect(cash.ok).toBe(true)
    await handle.db.transaction((tx) =>
      reconcileAttempt(
        tx,
        attemptId,
        processorState({ objectId: 'pi_over' }),
        { kind: 'event' },
        signal,
        NOW,
      ),
    )
    const overview = await loadPaymentsOverview(handle.db, world.staff, { date: TODAY }, signal)
    if (!overview.ok) throw new Error(overview.error)
    expect(overview.value.overpayments).toMatchObject([
      { applicationNumber: over.number, amountCents: 4500 },
    ])
  })

  it('the payments page is forbidden for a reviewer', async () => {
    expect(await loadPaymentsOverview(handle.db, world.reviewer, { date: TODAY }, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('settings loader never returns credentials_enc', async () => {
    const loaded = await loadProcessorSettings(handle.db, world.admin, signal)
    if (!loaded.ok) throw new Error(loaded.error)
    const text = JSON.stringify(loaded.value)
    expect(text).not.toContain('credentialsEnc')
    expect(text).not.toContain('credentials_enc')
    expect(text).not.toContain('sk_test_123')
    expect(text).not.toContain('whsec_test')
    expect(loaded.value.accounts).toMatchObject([{ processor: 'stripe', isActive: true }])
    expect(loaded.value.active).toBe('ready')
    expect(loaded.value.cloverStatus).toBe('stubbed')
  })

  it('settings loader says not configured with no active account', async () => {
    await handle.db.update(processorAccounts).set({ isActive: false })
    const loaded = await loadProcessorSettings(handle.db, world.admin, signal)
    expect(loaded.ok && loaded.value.active).toBe('not_configured')
    await handle.db.update(processorAccounts).set({ isActive: true })
  })

  it('staff cannot load processor settings', async () => {
    expect(await loadProcessorSettings(handle.db, world.staff, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})

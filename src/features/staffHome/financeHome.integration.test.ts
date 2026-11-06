import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { paymentAttempts } from '@/db/schema'
import { loadPaymentsOverview } from '@/features/payments/overview'
import { loadFinanceSection } from '@/features/staffHome/financeHome'
import type { PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { homeContextFor, rowCount, rowHref } from '@/test/homeFixtures'
import { setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'
import { makeCardAttempt, setupPayments } from '@/test/paymentFixtures'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
const UNKNOWN = 'Card payments with an unknown outcome'
const ANOMALIES = 'Card payments with an anomaly'
let handle: TestDb
let world: PermitWorld

async function attemptWith(patch: Partial<typeof paymentAttempts.$inferInsert>) {
  const trade = await submittedTrade(handle.db, world)
  const { attemptId } = await makeCardAttempt(handle.db, trade)
  await handle.db.update(paymentAttempts).set(patch).where(eq(paymentAttempts.id, attemptId))
}

beforeAll(async () => {
  handle = await makeTestDb()
  world = (await setupTradeWorld(handle.db)).world
  await setupPayments(handle.db, world.admin)
  await attemptWith({ outcomeUnknown: true, anomaly: 'amount_mismatch', processorObjectId: 'pi_a' })
  await attemptWith({ outcomeUnknown: true, processorObjectId: 'pi_b' })
  await attemptWith({ processorObjectId: 'pi_c' })
})
afterAll(async () => {
  await handle.drop()
})

describe('the Payments card on Today', () => {
  it('shows a clerk the card payments the Payments page lists as unknown or anomalous', async () => {
    const ctx = await homeContextFor(handle.db, world.staff, NOW)
    const section = await loadFinanceSection(ctx)
    const overview = await loadPaymentsOverview(handle.db, world.staff, { date: ctx.today }, signal)
    if (!overview.ok) throw new Error(overview.error)
    expect(rowCount(section, UNKNOWN)).toBe(overview.value.unknownAttempts.length)
    expect(rowCount(section, UNKNOWN)).toBe(2)
    expect(rowHref(section, UNKNOWN)).toBe('/staff/payments#outcome-unknown')
    expect(rowCount(section, ANOMALIES)).toBe(overview.value.anomalies.length)
    expect(rowCount(section, ANOMALIES)).toBe(1)
    expect(rowHref(section, ANOMALIES)).toBe('/staff/payments#anomalies')
  })

  it('is absent for a viewer who cannot open Payments', async () => {
    const inspector = await staffActor(handle.db, 'inspector')
    expect(await loadFinanceSection(await homeContextFor(handle.db, inspector, NOW))).toBeNull()
  })
})

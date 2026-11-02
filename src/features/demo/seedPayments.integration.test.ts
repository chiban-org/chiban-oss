import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applications, ledgerEntries, paymentAttempts } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { DEMO_PAYMENT_DATE } from '@/features/demo/seedPayments'
import { feeBalance } from '@/features/ledger/feeBalance'
import { getPaymentSettings } from '@/features/payments/paymentSettings'
import { getActiveProcessor } from '@/features/payments/processorAccounts'
import { cashReceiptsReport } from '@/features/reports/cashReceipts'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  await seedDemo(handle.db, signal)
})
afterAll(async () => {
  await handle.drop()
})

describe('seeded payments', () => {
  it('seeds published payment settings and an active simulated processor account', async () => {
    const settings = await getPaymentSettings(handle.db, signal)
    expect(settings.convenienceFee.basisPoints).toBe(300)
    const loaded = await getActiveProcessor(handle.db, signal)
    expect(loaded.state === 'known' && loaded.value.account.processor).toBe('simulated')
  })

  it('seeds a cash permit, a simulated card permit with a 1000 refund, a returned check, and an unknown attempt', async () => {
    const entries = await handle.db.select().from(ledgerEntries)
    const types = entries.map((e) => `${e.entryType}:${e.method}`)
    expect(types).toEqual(
      expect.arrayContaining([
        'payment:cash',
        'payment:check',
        'payment:card_present',
        'refund:card_present',
        'returned_check:check',
      ]),
    )
    expect(entries.find((e) => e.entryType === 'refund')?.amountCents).toBe(-1000)
    const unknown = await handle.db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.outcomeUnknown, true))
    expect(unknown).toHaveLength(1)
    expect(unknown[0]?.state).toBe('pending')
  })

  it('spreads demo money over at least two business dates', async () => {
    const dates = new Set((await handle.db.select().from(ledgerEntries)).map((e) => e.businessDate))
    expect(dates.has(DEMO_PAYMENT_DATE)).toBe(true)
    expect(dates.size).toBeGreaterThanOrEqual(2)
  })

  it('seeded cash receipts report for the first seeded date has nonzero cash, check, and simulated totals', async () => {
    const finance = await handle.db.query.users.findFirst({
      where: (u, { eq: same }) => same(u.email, 'finance@alderpond.example'),
    })
    const actor = await loadActor(handle.db, finance?.id ?? '', signal)
    const report = await cashReceiptsReport(handle.db, actor!, { date: DEMO_PAYMENT_DATE }, signal)
    if (!report.ok) throw new Error(report.error)
    expect(report.value.totalsByMethod.cash).toBeGreaterThan(0)
    expect(report.value.totalsByMethod.check).toBeGreaterThan(0)
    expect(report.value.totalsByMethod.simulated).toBeGreaterThan(0)
  })

  it('the returned-check permit stays issued with its fee due, the refunded one owes its refunded share, and the renewal fee is open', async () => {
    const issued = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.state, 'issued'))
    const dues = await Promise.all(
      issued.map(
        async (app) =>
          [app.number, (await feeBalance(handle.db, app.id, signal)).dueCents] as const,
      ),
    )
    const owing = dues
      .filter(([, due]) => due > 0)
      .map(([, due]) => due)
      .sort((a, b) => a - b)
    expect(owing).toEqual([971, 4500, 4500])
  })
})

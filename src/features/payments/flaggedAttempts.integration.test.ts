import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { paymentAttempts } from '@/db/schema'
import { loadPaymentsOverview } from '@/features/payments/overview'
import { loadFinanceSection } from '@/features/staffHome/financeHome'
import type { PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { homeContextFor, rowCount } from '@/test/homeFixtures'
import { setupTradeWorld } from '@/test/ledgerFixtures'
import { setupPayments } from '@/test/paymentFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const TODAY = '2027-03-02' as CivilDate
const NOW = new Date('2027-03-02T17:00:00Z')
const FLAGGED = 54
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = (await setupTradeWorld(handle.db)).world
  const { accountId } = await setupPayments(handle.db, world.admin)
  await handle.db.insert(paymentAttempts).values(
    Array.from({ length: FLAGGED }, (_, i) => ({
      processorAccountId: accountId,
      channel: 'card_online' as const,
      outcomeUnknown: true,
      anomaly: i === 0 ? 'amount_mismatch' : null,
      baseCents: 1000,
      convenienceFeeCents: 30,
      amountCents: 1030,
      plannedAllocations: [],
      payerName: `Payer ${i}`,
      idempotencyKey: `flagged-${i}`,
    })),
  )
})
afterAll(async () => {
  await handle.drop()
})

async function overview(unknown: number) {
  const result = await loadPaymentsOverview(
    handle.db,
    world.staff,
    { date: TODAY, flagged: { unknown, anomalies: 0 } },
    signal,
  )
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('card payments flagged on the Payments page', () => {
  it('pages through more unknown outcomes than one page holds and reports the full count', async () => {
    const first = await overview(0)
    expect(first.unknownAttempts).toHaveLength(50)
    expect(first.flaggedPages.unknown).toMatchObject({
      total: FLAGGED,
      offset: 0,
      prevOffset: null,
      nextOffset: 50,
    })
    const second = await overview(50)
    expect(second.unknownAttempts).toHaveLength(FLAGGED - 50)
    expect(second.flaggedPages.unknown).toMatchObject({ prevOffset: 0, nextOffset: null })
    const ids = new Set([...first.unknownAttempts, ...second.unknownAttempts].map((a) => a.id))
    expect(ids.size).toBe(FLAGGED)
  })

  it('gives Today the same total the page reports', async () => {
    const section = await loadFinanceSection(await homeContextFor(handle.db, world.staff, NOW))
    const page = await overview(0)
    expect(rowCount(section, 'Card payments with an unknown outcome')).toBe(
      page.flaggedPages.unknown.total,
    )
    expect(rowCount(section, 'Card payments with an anomaly')).toBe(
      page.flaggedPages.anomalies.total,
    )
  })
})

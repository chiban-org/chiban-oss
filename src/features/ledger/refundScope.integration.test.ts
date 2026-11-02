import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { feeBalance } from '@/features/ledger/feeBalance'
import { refundableLines } from '@/features/ledger/refundableLines'
import { correctEntry, refundEntry } from '@/features/ledger/reversals'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  lineAllocation,
  setupTradeWorld,
  submittedTrade,
  type TradeFixture,
} from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'
import { setupPayments } from '@/test/paymentFixtures'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
const REASON = 'Permit pulled in error'
let handle: TestDb
let first: TradeFixture
let second: TradeFixture
let entryId = ''

beforeEach(async () => {
  handle = await makeTestDb()
  const { world } = await setupTradeWorld(handle.db)
  first = await submittedTrade(handle.db, world)
  second = await submittedTrade(handle.db, world)
  await setupPayments(handle.db, world.admin)
  const paid = await recordCounterPayment(
    handle.db,
    world.staff,
    {
      method: 'cash',
      amountCents: 4500,
      payerName: 'Pat Contractor',
      allocations: [lineAllocation(first, 4500)],
    },
    signal,
    NOW,
  )
  if (!paid.ok) throw new Error(paid.error)
  entryId = paid.value.entryId
  const moved = await correctEntry(
    handle.db,
    await staffActor(handle.db, 'finance'),
    {
      entryId,
      reason: REASON,
      amountDeltaCents: 0,
      allocations: [lineAllocation(first, -1000), lineAllocation(second, 1000)],
    },
    signal,
    { now: NOW },
  )
  if (!moved.ok) throw new Error(moved.error)
})
afterEach(async () => {
  await handle.drop()
})

const refund = async (amountCents: number, applicationId: string) =>
  await refundEntry(
    handle.db,
    await staffActor(handle.db, 'finance'),
    { entryId, amountCents, reason: REASON, applicationId },
    signal,
    { now: NOW },
  )

describe('a refund on one application', () => {
  it('lists only the lines of this payment on that application', async () => {
    expect(await refundableLines(handle.db, entryId, first.applicationId)).toEqual([
      expect.objectContaining({ applicationId: first.applicationId, cents: 3500 }),
    ])
    expect(await refundableLines(handle.db, entryId, second.applicationId)).toEqual([
      expect.objectContaining({ applicationId: second.applicationId, cents: 1000 }),
    ])
  })

  it('draws only from the acting application and leaves the other untouched', async () => {
    const dueFirst = (await feeBalance(handle.db, first.applicationId, signal)).dueCents
    const dueSecond = (await feeBalance(handle.db, second.applicationId, signal)).dueCents
    const r = await refund(3500, first.applicationId)
    expect(r.ok).toBe(true)
    expect((await feeBalance(handle.db, second.applicationId, signal)).dueCents).toBe(dueSecond)
    expect((await feeBalance(handle.db, first.applicationId, signal)).dueCents).toBe(
      dueFirst + 3500,
    )
  })

  it('refuses more than this application holds instead of splitting into the other one', async () => {
    const dueSecond = (await feeBalance(handle.db, second.applicationId, signal)).dueCents
    const r = await refund(4000, first.applicationId)
    expect(r).toEqual({ ok: false, error: 'over_reversed' })
    expect((await feeBalance(handle.db, second.applicationId, signal)).dueCents).toBe(dueSecond)
  })
})

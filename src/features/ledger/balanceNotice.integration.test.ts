import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import {
  returnedCheckNotices,
  returnedCheckNoticesForParcel,
} from '@/features/ledger/balanceNotice'
import { recordReturnedCheck } from '@/features/ledger/reversals'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  lineAllocation,
  setupTradeWorld,
  submittedTrade,
  type TradeFixture,
  tryIssue,
} from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'
import { setupPayments } from '@/test/paymentFixtures'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let trade: TradeFixture

beforeEach(async () => {
  handle = await makeTestDb()
  const { world } = await setupTradeWorld(handle.db)
  trade = await submittedTrade(handle.db, world)
  await setupPayments(handle.db, world.admin)
})
afterEach(async () => {
  await handle.drop()
})

async function payByCheck(): Promise<string> {
  const r = await recordCounterPayment(
    handle.db,
    trade.world.staff,
    {
      method: 'check',
      amountCents: 4500,
      checkNumber: '1042',
      payerName: 'Pat Contractor',
      allocations: [lineAllocation(trade, 4500)],
    },
    signal,
    NOW,
  )
  if (!r.ok) throw new Error(r.error)
  return r.value.entryId
}

describe('returned check notices', () => {
  it('shows nothing while the check has not been returned', async () => {
    await payByCheck()
    expect(await returnedCheckNotices(handle.db, [trade.applicationId], signal)).toEqual([])
  })

  it('reports the balance left by a returned check on the application and its parcel', async () => {
    const entryId = await payByCheck()
    expect((await tryIssue(handle.db, trade)).ok).toBe(true)
    const returned = await recordReturnedCheck(
      handle.db,
      await staffActor(handle.db, 'finance'),
      { entryId, reason: 'Insufficient funds notice', returnedOn: '2027-03-05' as never },
      signal,
      { now: NOW },
    )
    expect(returned.ok).toBe(true)
    const expected = [
      { applicationId: trade.applicationId, number: expect.any(String), dueCents: 4500 },
    ]
    expect(await returnedCheckNotices(handle.db, [trade.applicationId], signal)).toEqual(expected)
    expect(await returnedCheckNoticesForParcel(handle.db, trade.world.parcelId, signal)).toEqual(
      expected,
    )
  })

  it('clears once the balance is paid again', async () => {
    const entryId = await payByCheck()
    await recordReturnedCheck(
      handle.db,
      await staffActor(handle.db, 'finance'),
      { entryId, reason: 'Insufficient funds notice', returnedOn: '2027-03-05' as never },
      signal,
      { now: NOW },
    )
    const again = await recordCounterPayment(
      handle.db,
      trade.world.staff,
      {
        method: 'cash',
        amountCents: 4500,
        payerName: 'Pat Contractor',
        allocations: [lineAllocation(trade, 4500)],
      },
      signal,
      NOW,
    )
    expect(again.ok).toBe(true)
    expect(await returnedCheckNotices(handle.db, [trade.applicationId], signal)).toEqual([])
  })
})

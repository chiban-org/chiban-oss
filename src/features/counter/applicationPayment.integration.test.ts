import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { recordApplicationPayment } from '@/features/counter/applicationPayment'
import { feeBalance } from '@/features/ledger/feeBalance'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld, submittedTrade, type TradeFixture } from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const NOON = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let trade: TradeFixture

beforeEach(async () => {
  handle = await makeTestDb()
  const { world } = await setupTradeWorld(handle.db)
  trade = await submittedTrade(handle.db, world)
})
afterEach(async () => {
  await handle.drop()
})

const due = async () => (await feeBalance(handle.db, trade.applicationId, signal)).dueCents

describe('recordApplicationPayment', () => {
  it('a check for the full 4500 due clears the balance and issues a receipt', async () => {
    const r = await recordApplicationPayment(
      handle.db,
      trade.world.staff,
      {
        applicationId: trade.applicationId,
        method: 'check',
        amountCents: 4500,
        checkNumber: '2201',
        payerName: 'Pat Contractor',
      },
      signal,
      NOON,
    )
    expect(r.ok && r.value.receiptNumber).toBe('R-2027-000001')
    expect(await due()).toBe(0)
  })

  it('a partial cash payment of 2000 leaves 2500 due and gives change on 5000 tendered', async () => {
    const r = await recordApplicationPayment(
      handle.db,
      trade.world.staff,
      {
        applicationId: trade.applicationId,
        method: 'cash',
        amountCents: 2000,
        tenderedCents: 5000,
        payerName: 'Pat Contractor',
      },
      signal,
      NOON,
    )
    expect(r.ok && r.value.changeCents).toBe(3000)
    expect(await due()).toBe(2500)
  })

  it('more than the balance due is over_allocated and records nothing', async () => {
    const r = await recordApplicationPayment(
      handle.db,
      trade.world.staff,
      { applicationId: trade.applicationId, method: 'cash', amountCents: 9000, payerName: 'Pat' },
      signal,
      NOON,
    )
    expect(r).toEqual({ ok: false, error: 'over_allocated' })
    expect(await due()).toBe(4500)
  })

  it('a reviewer cannot record a payment', async () => {
    const r = await recordApplicationPayment(
      handle.db,
      await staffActor(handle.db, 'reviewer'),
      { applicationId: trade.applicationId, method: 'cash', amountCents: 4500, payerName: 'Pat' },
      signal,
      NOON,
    )
    expect(r).toEqual({ ok: false, error: 'forbidden' })
    expect(await due()).toBe(4500)
  })
})

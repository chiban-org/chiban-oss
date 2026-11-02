import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { feeAssessments } from '@/db/schema'
import { postEntry } from '@/features/ledger/postEntry'
import type { AllocationInput, PostEntryInput } from '@/features/ledger/types'
import { cashReceiptsReport } from '@/features/reports/cashReceipts'
import { toCsv } from '@/features/reports/cashReceiptsCsv'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  lineAllocation,
  setupTradeWorld,
  submittedTrade,
  type TradeFixture,
} from '@/test/ledgerFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const DAY = '2027-03-01' as CivilDate
const EVENING = new Date('2027-03-02T03:30:00Z')
let handle: TestDb
let trade: TradeFixture
let second: TradeFixture

beforeEach(async () => {
  handle = await makeTestDb()
  const { world } = await setupTradeWorld(handle.db)
  trade = await submittedTrade(handle.db, world)
  second = await submittedTrade(handle.db, world)
})
afterEach(async () => {
  await handle.drop()
})

function entry(
  overrides: Partial<PostEntryInput> & Pick<PostEntryInput, 'amountCents' | 'allocations'>,
): PostEntryInput {
  return {
    entryType: 'payment',
    method: 'cash',
    postedAt: EVENING,
    payerName: 'Pat Contractor',
    actor: { kind: 'user', userId: trade.world.staff.userId },
    ...overrides,
  }
}

async function post(input: PostEntryInput) {
  const posted = await handle.db.transaction((tx) => postEntry(tx, input, signal))
  if (!posted.ok) throw new Error(posted.error)
  return posted.value.entryId
}

const cash = (target: TradeFixture, at: Date = EVENING) =>
  post(entry({ amountCents: 4500, postedAt: at, allocations: [lineAllocation(target, 4500)] }))

function cardAllocations(target: TradeFixture): AllocationInput[] {
  return [
    lineAllocation(target, 4500),
    { targetKind: 'convenience_fee', applicationId: target.applicationId, amountCents: 135 },
  ]
}

const cardEntry = (target: TradeFixture, extra: Partial<PostEntryInput> = {}) =>
  entry({
    method: 'card_online',
    amountCents: 4635,
    allocations: cardAllocations(target),
    processor: { name: 'stripe', accountId: randomUUID(), objectId: `pi_${randomUUID()}` },
    ...extra,
  })

async function report(date: CivilDate = DAY, actor = trade.world.staff) {
  const r = await cashReceiptsReport(handle.db, actor, { date }, signal)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe('cashReceiptsReport', () => {
  it('entry at 2027-03-02T03:30Z reports on 2027-03-01', async () => {
    await cash(trade)
    expect((await report('2027-03-01' as CivilDate)).grandTotalCents).toBe(4500)
    expect((await report('2027-03-02' as CivilDate)).grandTotalCents).toBe(0)
  })

  it('cash 4500 and card 4635 report 4500 under cash and card online plus 135 convenience fee', async () => {
    await cash(trade)
    await post(cardEntry(second))
    const r = await report()
    expect(r.rows).toMatchObject([
      { feeCode: 'el', byMethod: { cash: 4500, card_online: 4500 }, totalCents: 9000 },
    ])
    expect(r.convenienceFees).toMatchObject({ card_online: 135 })
    expect(r.totalsByMethod).toMatchObject({ cash: 4500, card_online: 4635 })
    expect(r.grandTotalCents).toBe(9135)
    expect(r.entryCount).toBe(2)
  })

  it('a refund posted on 2027-03-03 reduces 2027-03-03, not the payment day', async () => {
    const paid = await cash(trade)
    await post({
      ...entry({ amountCents: -1000, allocations: [lineAllocation(trade, -1000)] }),
      entryType: 'refund',
      reversesEntryId: paid,
      reason: 'Partial refund for a reduced scope',
      postedAt: new Date('2027-03-03T17:00:00Z'),
    })
    expect((await report('2027-03-01' as CivilDate)).grandTotalCents).toBe(4500)
    const later = await report('2027-03-03' as CivilDate)
    expect(later.grandTotalCents).toBe(-1000)
    expect(later.rows).toMatchObject([{ feeCode: 'el', byMethod: { cash: -1000 } }])
  })

  it('simulated entries report under Simulated', async () => {
    await post(
      cardEntry(trade, {
        processor: { name: 'simulated', accountId: randomUUID(), objectId: 'sim_pi_1' },
      }),
    )
    const r = await report()
    expect(r.totalsByMethod).toMatchObject({ simulated: 4635, card_online: 0 })
    expect(r.rows[0]?.byMethod).toMatchObject({ simulated: 4500 })
  })

  it('overpayments are their own line and never fee revenue', async () => {
    await post(
      entry({
        amountCents: 4500,
        method: 'card_online',
        allocations: [
          { targetKind: 'overpayment', applicationId: trade.applicationId, amountCents: 4500 },
        ],
        processor: { name: 'stripe', accountId: randomUUID(), objectId: 'pi_over' },
      }),
    )
    const r = await report()
    expect(r.rows).toEqual([])
    expect(r.overpayments).toMatchObject({ card_online: 4500 })
    expect(r.grandTotalCents).toBe(4500)
  })

  it('check list shows number, payer, amount', async () => {
    await post(
      entry({
        method: 'check',
        checkNumber: '1042',
        amountCents: 4500,
        allocations: [lineAllocation(trade, 4500)],
      }),
    )
    expect((await report()).checks).toEqual([
      { number: '1042', payerName: 'Pat Contractor', amountCents: 4500 },
    ])
  })

  it('reviewer is forbidden', async () => {
    const r = await cashReceiptsReport(handle.db, trade.world.reviewer, { date: DAY }, signal)
    expect(r).toEqual({ ok: false, error: 'forbidden' })
  })

  it('an empty day returns zero rows and grand total 0', async () => {
    const r = await report('2027-04-01' as CivilDate)
    expect(r).toMatchObject({ rows: [], grandTotalCents: 0, entryCount: 0, checks: [] })
  })
})

describe('toCsv', () => {
  it('csv header matches exactly and a fee label with a comma is quoted', async () => {
    const [assessment] = await handle.db
      .select()
      .from(feeAssessments)
      .where(eq(feeAssessments.id, trade.assessmentId))
    const computation = assessment?.computation as { lines: { label: string }[] }
    await handle.db
      .update(feeAssessments)
      .set({
        computation: {
          ...computation,
          lines: computation.lines.map((l) => ({ ...l, label: 'Permit, "electrical"' })),
        },
      })
      .where(eq(feeAssessments.id, trade.assessmentId))
    await cash(trade)
    await post(cardEntry(second))
    const csv = toCsv(await report())
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Date,Fee code,Fee,Cash,Check,Card present,Card online,Simulated,Total')
    expect(lines[1]).toBe('2027-03-01,el,"Permit, ""electrical""",45.00,0.00,0.00,45.00,0.00,90.00')
    expect(lines.slice(2)).toEqual([
      '2027-03-01,,Convenience fee,0.00,0.00,0.00,1.35,0.00,1.35',
      '2027-03-01,,Overpayment,0.00,0.00,0.00,0.00,0.00,0.00',
      '2027-03-01,,Total,45.00,0.00,0.00,46.35,0.00,91.35',
      '',
    ])
  })

  it('an empty day is a header and zero rows', async () => {
    const csv = toCsv(await report('2027-04-01' as CivilDate))
    expect(csv.split('\r\n')).toEqual([
      'Date,Fee code,Fee,Cash,Check,Card present,Card online,Simulated,Total',
      '2027-04-01,,Convenience fee,0.00,0.00,0.00,0.00,0.00,0.00',
      '2027-04-01,,Overpayment,0.00,0.00,0.00,0.00,0.00,0.00',
      '2027-04-01,,Total,0.00,0.00,0.00,0.00,0.00,0.00',
      '',
    ])
  })
})

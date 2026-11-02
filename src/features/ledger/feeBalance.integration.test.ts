import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, feeAssessments } from '@/db/schema'
import { transitionApplication } from '@/features/applications/transition'
import type { FeeComputation } from '@/features/fees/computeFees'
import { overrideAdministrativeGate } from '@/features/gates/overrides'
import { feeBalance } from '@/features/ledger/feeBalance'
import { postEntry } from '@/features/ledger/postEntry'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  lineAllocation,
  setupTradeWorld,
  submittedTrade,
  type TradeFixture,
} from '@/test/ledgerFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const ON = '2027-03-10' as CivilDate
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

async function pay(amountCents: number, method: 'cash' | 'card_online' = 'cash') {
  const posted = await handle.db.transaction((tx) =>
    postEntry(
      tx,
      {
        entryType: 'payment',
        method,
        amountCents,
        postedAt: new Date('2027-03-02T15:00:00Z'),
        payerName: 'Pat Contractor',
        actor: { kind: 'user', userId: trade.world.staff.userId },
        allocations: [lineAllocation(trade, amountCents)],
      },
      signal,
    ),
  )
  if (!posted.ok) throw new Error(posted.error)
}

async function issue() {
  const [row] = await handle.db
    .select()
    .from(applications)
    .where(eq(applications.id, trade.applicationId))
  return await handle.db.transaction((tx) =>
    transitionApplication(
      tx,
      trade.world.staff,
      {
        applicationId: trade.applicationId,
        to: 'issued',
        expectedRowVersion: row?.rowVersion ?? 0,
        onDate: ON,
      },
      signal,
    ),
  )
}

describe('feeBalance', () => {
  it('assessed 4500 with no payment is due 4500', async () => {
    const balance = await feeBalance(handle.db, trade.applicationId, signal)
    expect(balance.dueCents).toBe(4500)
    expect(balance.lines).toMatchObject([
      { stage: 'at_intake', feeCode: 'el', assessedCents: 4500, paidCents: 0, dueCents: 4500 },
    ])
  })

  it('a 4500 payment entry makes the line due 0', async () => {
    await pay(4500)
    const balance = await feeBalance(handle.db, trade.applicationId, signal)
    expect(balance.lines[0]).toMatchObject({ paidCents: 4500, dueCents: 0 })
    expect(balance.dueCents).toBe(0)
  })

  it('reassessment to 9000 after a 4500 payment leaves 4500 due', async () => {
    await pay(4500)
    const [first] = await handle.db
      .select()
      .from(feeAssessments)
      .where(eq(feeAssessments.id, trade.assessmentId))
    const computation = first?.computation as FeeComputation
    await handle.db.insert(feeAssessments).values({
      applicationId: trade.applicationId,
      stage: 'at_intake',
      sequence: 2,
      scheduleVersionId: first?.scheduleVersionId ?? '',
      computation: {
        ...computation,
        lines: computation.lines.map((l) => ({
          ...l,
          amount: { value: 9000, source: 'town_setting', replaced: null },
        })),
        totalCents: 9000,
      },
      totalCents: 9000,
      assessedBy: 'test',
    })
    const balance = await feeBalance(handle.db, trade.applicationId, signal)
    expect(balance.lines[0]).toMatchObject({ assessedCents: 9000, paidCents: 4500, dueCents: 4500 })
  })
})

describe('fees.paid gate', () => {
  it('issuance of a trade permit with 4500 due is blocked by fees.paid', async () => {
    const result = await issue()
    expect(result.ok).toBe(false)
    const blocked = !result.ok && typeof result.error === 'object' ? result.error.gateBlocked : []
    expect(blocked.find((g) => g.key === 'fees.paid')).toMatchObject({
      effective: 'blocked',
      outcome: { status: 'blocked', reason: 'Fees due: $45.00.' },
    })
  })

  it('issuance after a card_online payment entry passes fees.paid', async () => {
    await pay(4500, 'card_online')
    expect(await issue()).toMatchObject({ ok: true })
  })

  it('staff override of fees.paid with a reason lets issuance pass', async () => {
    const overridden = await overrideAdministrativeGate(
      handle.db,
      trade.world.staff,
      {
        applicationId: trade.applicationId,
        gateKey: 'fees.paid',
        reason: 'Fee waived by board vote',
      },
      signal,
    )
    expect(overridden.ok).toBe(true)
    expect(await issue()).toMatchObject({ ok: true })
  })
})

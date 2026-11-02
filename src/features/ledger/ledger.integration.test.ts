import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ledgerAllocations, ledgerEntries } from '@/db/schema'
import { postEntry } from '@/features/ledger/postEntry'
import type { PostEntryInput } from '@/features/ledger/types'
import { makeTestDb, type TestDb } from '@/test/db'
import { expectDbError } from '@/test/dbErrors'
import {
  lineAllocation,
  setupTradeWorld,
  submittedTrade,
  type TradeFixture,
} from '@/test/ledgerFixtures'

const signal = new AbortController().signal
const AT = new Date('2027-03-02T15:00:00Z')
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

function cashPayment(amountCents: number, extra: Partial<PostEntryInput> = {}): PostEntryInput {
  return {
    entryType: 'payment',
    method: 'cash',
    amountCents,
    postedAt: AT,
    payerName: 'Pat Contractor',
    actor: { kind: 'user', userId: trade.world.staff.userId },
    allocations: [lineAllocation(trade, amountCents)],
    ...extra,
  }
}

async function post(input: PostEntryInput) {
  return await handle.db.transaction((tx) => postEntry(tx, input, signal))
}

async function firstEntryId(): Promise<string> {
  const posted = await post(cashPayment(4500))
  if (!posted.ok) throw new Error('post failed')
  return posted.value.entryId
}

describe('append-only ledger', () => {
  it('update of a ledger entry raises E_PAY_001', async () => {
    const id = await firstEntryId()
    await expectDbError(
      handle.db.execute(
        sql`update ledger_entries set payer_name = 'Someone Else' where id = ${id}`,
      ),
      /E_PAY_001/,
    )
  })

  it('delete of an allocation raises E_PAY_001', async () => {
    await firstEntryId()
    await expectDbError(handle.db.delete(ledgerAllocations), /E_PAY_001/)
  })

  it('truncate of the ledger raises E_PAY_001', async () => {
    await firstEntryId()
    await expectDbError(
      handle.db.execute(sql`truncate ledger_entries, ledger_allocations cascade`),
      /E_PAY_001/,
    )
  })
})

describe('allocation invariant', () => {
  it('entry whose allocations sum to 4400 against 4500 fails at commit with E_PAY_002', async () => {
    await expectDbError(
      handle.db.transaction(async (tx) => {
        const [entry] = await tx
          .insert(ledgerEntries)
          .values({
            entryType: 'payment',
            method: 'cash',
            amountCents: 4500,
            postedAt: AT,
            businessDate: '2027-03-02',
            payerName: 'Pat Contractor',
            actorKind: 'user',
            actorUserId: trade.world.staff.userId,
          })
          .returning({ id: ledgerEntries.id })
        await tx
          .insert(ledgerAllocations)
          .values({ entryId: entry?.id ?? '', ...lineAllocation(trade, 4400) })
      }),
      /E_PAY_002/,
    )
  })

  it('payment entry without allocations is refused', async () => {
    await expect(post(cashPayment(4500, { allocations: [] }))).rejects.toMatchObject({
      id: 'E_PAY_002',
    })
    await expectDbError(
      handle.db.insert(ledgerEntries).values({
        entryType: 'payment',
        method: 'cash',
        amountCents: 4500,
        postedAt: AT,
        businessDate: '2027-03-02',
        payerName: 'Pat Contractor',
        actorKind: 'user',
      }),
      /E_PAY_002/,
    )
  })

  it('refund with a positive amount violates the sign check', async () => {
    const id = await firstEntryId()
    await expectDbError(
      handle.db.insert(ledgerEntries).values({
        entryType: 'refund',
        method: 'cash',
        amountCents: 100,
        postedAt: AT,
        businessDate: '2027-03-02',
        payerName: 'Pat Contractor',
        actorKind: 'user',
        reversesEntryId: id,
        reason: 'wrong sign on purpose',
      }),
      /ledger_entries_sign/,
    )
  })

  it('a payment cannot allocate more than the fee line has due', async () => {
    const posted = await post(cashPayment(9000))
    expect(posted).toEqual({ ok: false, error: 'over_allocated' })
    expect(await handle.db.select().from(ledgerEntries)).toHaveLength(0)
  })
})

describe('processor keys', () => {
  const accountId = randomUUID()
  const processor = { name: 'stripe' as const, accountId, objectId: 'pi_123' }

  it('duplicate processor object and type returns the first entry id and inserts nothing', async () => {
    const first = await post(cashPayment(4500, { method: 'card_online', processor }))
    const second = await post(cashPayment(4500, { method: 'card_online', processor }))
    expect(first.ok && second.ok && second.value.entryId).toBe(first.ok && first.value.entryId)
    expect(await handle.db.select().from(ledgerEntries)).toHaveLength(1)
    expect(await handle.db.select().from(ledgerAllocations)).toHaveLength(1)
  })

  it('same processor object as payment and as refund are two entries', async () => {
    const first = await post(cashPayment(4500, { method: 'card_online', processor }))
    if (!first.ok) throw new Error('post failed')
    const refund = await post({
      entryType: 'refund',
      method: 'card_online',
      amountCents: -4500,
      postedAt: AT,
      payerName: 'Pat Contractor',
      reason: 'duplicate permit pulled',
      reversesEntryId: first.value.entryId,
      processor,
      actor: { kind: 'user', userId: trade.world.staff.userId },
      allocations: [lineAllocation(trade, -4500)],
    })
    expect(refund.ok).toBe(true)
    expect(await handle.db.select().from(ledgerEntries)).toHaveLength(2)
  })
})

describe('business date', () => {
  it('is the town civil date of posted_at', async () => {
    const late = new Date('2027-03-02T03:30:00Z')
    await post(cashPayment(4500, { postedAt: late }))
    const [row] = await handle.db.select().from(ledgerEntries)
    expect(row?.businessDate).toBe('2027-03-01')
  })
})

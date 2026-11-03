import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { postEntry } from '@/features/ledger/postEntry'
import type { EntryFilters, EntrySortKey } from '@/features/payments/entryListParams'
import { loadPaymentsOverview } from '@/features/payments/overview'
import type { PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { lineAllocation, setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'
import { setupPayments } from '@/test/paymentFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const TODAY = '2027-03-02' as CivilDate
let handle: TestDb
let world: PermitWorld
let cashPat = ''
let checkAvery = ''
let cardZed = ''
let refundZed = ''

beforeAll(async () => {
  handle = await makeTestDb()
  world = (await setupTradeWorld(handle.db)).world
  await setupPayments(handle.db, world.admin)
  const a = await submittedTrade(handle.db, world)
  const b = await submittedTrade(handle.db, world)
  const c = await submittedTrade(handle.db, world)
  const cash = await recordCounterPayment(
    handle.db,
    world.staff,
    {
      method: 'cash',
      amountCents: 4500,
      payerName: 'Pat Contractor',
      allocations: [lineAllocation(a, 4500)],
    },
    signal,
    new Date('2027-03-02T17:00:00Z'),
  )
  const check = await recordCounterPayment(
    handle.db,
    world.staff,
    {
      method: 'check',
      checkNumber: '1042',
      amountCents: 3000,
      payerName: 'Avery Builder',
      allocations: [lineAllocation(b, 3000)],
    },
    signal,
    new Date('2027-03-02T17:10:00Z'),
  )
  if (!cash.ok) throw new Error(`cash ${cash.error}`)
  if (!check.ok) throw new Error(`check ${check.error}`)
  cashPat = cash.value.entryId
  checkAvery = check.value.entryId
  const processor = { name: 'stripe' as const, accountId: crypto.randomUUID(), objectId: 'pi_zed' }
  const card = await handle.db.transaction((tx) =>
    postEntry(
      tx,
      {
        entryType: 'payment',
        method: 'card_online',
        amountCents: 2000,
        postedAt: new Date('2027-03-02T17:20:00Z'),
        payerName: 'Zed Roofing',
        processor,
        actor: { kind: 'user', userId: world.staff.userId },
        allocations: [lineAllocation(c, 2000)],
      },
      signal,
    ),
  )
  if (!card.ok) throw new Error('card payment failed')
  cardZed = card.value.entryId
  const refund = await handle.db.transaction((tx) =>
    postEntry(
      tx,
      {
        entryType: 'refund',
        method: 'card_online',
        amountCents: -2000,
        postedAt: new Date('2027-03-02T17:30:00Z'),
        payerName: 'Zed Roofing',
        reason: 'duplicate permit',
        reversesEntryId: cardZed,
        processor,
        actor: { kind: 'user', userId: world.staff.userId },
        allocations: [lineAllocation(c, -2000)],
      },
      signal,
    ),
  )
  if (!refund.ok) throw new Error('refund failed')
  refundZed = refund.value.entryId
})
afterAll(async () => {
  await handle.drop()
})

async function overview(
  view: { filters?: EntryFilters; sort?: { key: EntrySortKey; dir: 'asc' | 'desc' } } = {},
) {
  const result = await loadPaymentsOverview(
    handle.db,
    world.staff,
    {
      date: TODAY,
      entries: {
        filters: view.filters ?? {},
        ...(view.sort === undefined ? {} : { sort: view.sort }),
      },
    },
    signal,
  )
  if (!result.ok) throw new Error(result.error)
  return result.value
}
const ids = async (view?: Parameters<typeof overview>[0]) =>
  (await overview(view)).todaysEntries.map((e) => e.id)
const by = (key: EntrySortKey, dir: 'asc' | 'desc') => ({ sort: { key, dir } })

describe('payments entries sorting', () => {
  it('opens with the most recently posted entry first', async () => {
    expect(await ids()).toEqual([refundZed, cardZed, checkAvery, cashPat])
  })

  it('sorts by entry kind and method with the newest first inside a tie', async () => {
    expect(await ids(by('entry', 'asc'))).toEqual([cardZed, cashPat, checkAvery, refundZed])
  })

  it('sorts by amount with the largest first on the first click', async () => {
    expect(await ids(by('amount', 'desc'))).toEqual([cashPat, checkAvery, cardZed, refundZed])
    expect(await ids(by('amount', 'asc'))).toEqual([refundZed, cardZed, checkAvery, cashPat])
  })

  it('sorts by payer with the newest first inside a tie', async () => {
    expect(await ids(by('payer', 'asc'))).toEqual([checkAvery, cashPat, refundZed, cardZed])
  })

  it('sorts by application number', async () => {
    expect(await ids(by('application', 'asc'))).toEqual([cashPat, checkAvery, refundZed, cardZed])
  })

  it('sorts by receipt number with entries that have no receipt last both ways', async () => {
    expect(await ids(by('receipt', 'asc'))).toEqual([cashPat, checkAvery, refundZed, cardZed])
    expect((await ids(by('receipt', 'desc'))).slice(2)).toEqual([refundZed, cardZed])
  })
})

describe('payments entries quick filters', () => {
  it('filters by method and ORs values inside the group', async () => {
    expect(await ids({ filters: { methods: ['cash'] } })).toEqual([cashPat])
    expect(await ids({ filters: { methods: ['cash', 'check'] } })).toEqual([checkAvery, cashPat])
  })

  it('filters by entry type', async () => {
    expect(await ids({ filters: { types: ['refund'] } })).toEqual([refundZed])
  })

  it('ANDs groups together', async () => {
    expect(await ids({ filters: { methods: ['card_online'], types: ['payment'] } })).toEqual([
      cardZed,
    ])
    expect(await ids({ filters: { methods: ['cash'], types: ['refund'] } })).toEqual([])
  })

  it('counts every chip with the other groups applied', async () => {
    const all = (await overview()).entryFacets
    expect(all.methods.get('card_online')).toBe(2)
    expect(all.methods.get('card_present')).toBe(0)
    expect(all.types.get('payment')).toBe(3)
    const narrowed = (await overview({ filters: { types: ['refund'] } })).entryFacets
    expect(narrowed.methods.get('card_online')).toBe(1)
    expect(narrowed.methods.get('cash')).toBe(0)
    expect(narrowed.types.get('payment')).toBe(3)
  })
})

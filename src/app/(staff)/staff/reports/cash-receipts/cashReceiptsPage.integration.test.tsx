import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { recordReturnedCheck } from '@/features/ledger/otherReversals'
import { postEntry } from '@/features/ledger/postEntry'
import { makeTestDb, type TestDb } from '@/test/db'
import { lineAllocation, setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

interface MockState {
  db: unknown
  actor: Actor | null
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { default: CashReceiptsPage } = await import('./page')

const signal = new AbortController().signal
let handle: TestDb
let finance: Actor

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  const { world } = await setupTradeWorld(handle.db)
  const trade = await submittedTrade(handle.db, world)
  finance = await staffActor(handle.db, 'finance')
  const posted = await handle.db.transaction((tx) =>
    postEntry(
      tx,
      {
        entryType: 'payment',
        method: 'check',
        checkNumber: '1042',
        amountCents: 4500,
        postedAt: new Date('2027-03-01T15:00:00Z'),
        payerName: 'Pat Contractor',
        actor: { kind: 'user', userId: world.staff.userId },
        allocations: [lineAllocation(trade, 4500)],
      },
      signal,
    ),
  )
  if (!posted.ok) throw new Error(posted.error)
  const returned = await recordReturnedCheck(
    handle.db,
    finance,
    {
      entryId: posted.value.entryId,
      reason: 'Insufficient funds',
      returnedOn: '2027-03-03' as CivilDate,
    },
    signal,
    { now: new Date('2027-03-03T15:00:00Z') },
  )
  if (!returned.ok) throw new Error(String(returned.error))
})
afterAll(async () => {
  await handle.drop()
})

async function page(date: string, actor: Actor = finance): Promise<string> {
  state.actor = actor
  return renderToStaticMarkup(await CashReceiptsPage({ searchParams: Promise.resolve({ date }) }))
}

describe('cash receipts report', () => {
  it('writes the report day in words', async () => {
    const html = await page('2026-11-02')
    expect(html).toContain('<h2>November 2, 2026</h2>')
    expect(html).not.toContain('<h2>2026-11-02</h2>')
  })

  it('says a day without money had none and offers no zero table or CSV', async () => {
    const html = await page('2026-11-02')
    expect(html).toContain('No money was received on this day. Choose another date above.')
    expect(html).not.toContain('$0.00')
    expect(html).not.toContain('ledger entries')
    expect(html).not.toContain('Download CSV')
  })

  it('keeps a check returned later on the deposit list and says when the return was recorded', async () => {
    const html = await page('2027-03-01')
    expect(html).not.toContain('No checks received.')
    expect(html).toContain('1042')
    expect(html).toContain('Returned, recorded March 3, 2027')
    expect(html).toContain('/staff/reports/cash-receipts/csv?date=2027-03-01')
    expect(html).toContain('/staff/reports/cash-receipts/xlsx?date=2027-03-01')
  })

  it('states the default order of both tables', async () => {
    const html = await page('2027-03-01')
    expect(html).toContain('Fees in alphabetical order.')
    expect(html).toContain('Checks in the order they were taken.')
  })

  it('sends someone without the report to their start page', async () => {
    const html = await page('2027-03-01', await staffActor(handle.db, 'inspector'))
    expect(html).toContain('You do not have permission to view this report.')
    expect(html).toContain('href="/staff"')
  })
})

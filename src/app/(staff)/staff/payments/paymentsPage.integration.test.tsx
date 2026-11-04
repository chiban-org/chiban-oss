import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { paymentAttempts } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { postEntry } from '@/features/ledger/postEntry'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  lineAllocation,
  setupTradeWorld,
  submittedTrade,
  type TradeFixture,
} from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'
import { makeCardAttempt, setupPayments } from '@/test/paymentFixtures'

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

const { default: PaymentsPage } = await import('./page')

const signal = new AbortController().signal
let handle: TestDb
let trade: TradeFixture

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  const { world } = await setupTradeWorld(handle.db)
  await setupPayments(handle.db, world.admin)
  trade = await submittedTrade(handle.db, world)
})
afterAll(async () => {
  await handle.drop()
})

async function page(actor: Actor = trade.world.staff): Promise<string> {
  state.actor = actor
  return renderToStaticMarkup(await PaymentsPage({ searchParams: Promise.resolve({}) }))
}

describe('payments page', () => {
  it('says once that nothing needs attention instead of drawing empty alert panels', async () => {
    const html = await page()
    expect(html).toContain('No card payment needs attention.')
    expect(html).not.toContain('None.')
    expect(html).not.toContain('Anomalies')
    expect(html).not.toContain('Overpayment to refund')
  })

  it('shows only the alert that has items, without a chip repeating its heading', async () => {
    const { attemptId } = await makeCardAttempt(handle.db, trade, 'card_present')
    await handle.db
      .update(paymentAttempts)
      .set({ outcomeUnknown: true })
      .where(eq(paymentAttempts.id, attemptId))
    const html = await page()
    expect(html).toContain('Card payments with an unknown outcome')
    expect(html).toContain(`href="/staff/payments/${attemptId}"`)
    expect(html).not.toContain('>Outcome unknown<')
    expect(html).not.toContain('Anomalies')
    expect(html).not.toContain('No card payment needs attention.')
  })

  it("states the default order of today's entries", async () => {
    const posted = await handle.db.transaction((tx) =>
      postEntry(
        tx,
        {
          entryType: 'payment',
          method: 'cash',
          amountCents: 4500,
          postedAt: new Date(),
          payerName: 'Pat Contractor',
          actor: { kind: 'user', userId: trade.world.staff.userId },
          allocations: [lineAllocation(trade, 4500)],
        },
        signal,
      ),
    )
    if (!posted.ok) throw new Error(posted.error)
    expect(await page()).toContain('Newest first. Click a column heading to sort.')
  })

  it('sends someone without payment access to their start page', async () => {
    const html = await page(await staffActor(handle.db, 'inspector'))
    expect(html).toContain('You do not have permission to view payments.')
    expect(html).toContain('href="/staff"')
  })
})

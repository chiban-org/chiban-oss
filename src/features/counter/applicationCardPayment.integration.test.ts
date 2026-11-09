import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ledgerEntries, paymentAttempts } from '@/db/schema'
import { startApplicationCardPayment } from '@/features/counter/applicationCardPayment'
import { feeBalance } from '@/features/ledger/feeBalance'
import { resolveSimulatedReader } from '@/features/payments/startPayment'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld, submittedTrade, type TradeFixture } from '@/test/ledgerFixtures'
import { PAYMENT_SETTINGS, setupPayments } from '@/test/paymentFixtures'

const signal = new AbortController().signal
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

const start = (actor = trade.world.staff) =>
  startApplicationCardPayment(
    handle.db,
    actor,
    { applicationId: trade.applicationId, payerName: 'Pat Contractor' },
    signal,
  )

const due = async () => (await feeBalance(handle.db, trade.applicationId, signal)).dueCents
const entries = async () => await handle.db.select().from(ledgerEntries)

async function settle(attemptId: string, outcome: 'captured' | 'declined') {
  const resolved = await resolveSimulatedReader(
    handle.db,
    trade.world.staff,
    { attemptId, outcome },
    signal,
  )
  if (!resolved.ok) throw new Error(`reader failed: ${JSON.stringify(resolved.error)}`)
  return resolved.value
}

describe('card at the counter for an application balance', () => {
  beforeEach(async () => {
    await setupPayments(handle.db, trade.world.admin, 'simulated', 'sim_town')
  })

  it('starts a pending card_present attempt for the balance plus the card fee, with no ledger entry', async () => {
    const started = await start()
    if (!started.ok) throw new Error(JSON.stringify(started.error))
    const [attempt] = await handle.db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, started.value.attemptId))
    expect(attempt).toMatchObject({
      channel: 'card_present',
      state: 'pending',
      baseCents: 4500,
      convenienceFeeCents: 135,
      amountCents: 4635,
    })
    expect(await entries()).toHaveLength(0)
    expect(await due()).toBe(4500)
  })

  it('posts the payment only once the processor approves', async () => {
    const started = await start()
    if (!started.ok) throw new Error('start failed')
    expect((await settle(started.value.attemptId, 'captured')).state).toBe('captured')
    expect((await entries()).map((e) => [e.method, e.amountCents])).toEqual([
      ['card_present', 4635],
    ])
    expect(await due()).toBe(0)
  })

  it('leaves the balance alone when the card is declined', async () => {
    const started = await start()
    if (!started.ok) throw new Error('start failed')
    expect((await settle(started.value.attemptId, 'declined')).state).toBe('declined')
    expect(await entries()).toHaveLength(0)
    expect(await due()).toBe(4500)
  })

  it('charges no card fee when the fee does not apply at the counter', async () => {
    await saveAndPublish(handle.db, trade.world.admin, 'payment_settings', 'default', {
      ...PAYMENT_SETTINGS,
      convenienceFee: { basisPoints: 300, fixedCents: 0, appliesTo: ['card_online'] },
    })
    expect((await start()).ok).toBe(true)
    const [attempt] = await handle.db.select().from(paymentAttempts)
    expect(attempt).toMatchObject({ amountCents: 4500, convenienceFeeCents: 0 })
  })

  it('refuses a second card payment while one is still waiting on the processor', async () => {
    expect((await start()).ok).toBe(true)
    expect(await start()).toEqual({ ok: false, error: 'card_attempt_open' })
    expect(await handle.db.select().from(paymentAttempts)).toHaveLength(1)
  })

  it('allows another try after a decline', async () => {
    const first = await start()
    if (!first.ok) throw new Error('start failed')
    await settle(first.value.attemptId, 'declined')
    expect((await start()).ok).toBe(true)
  })

  it('refuses a reviewer, who cannot collect payments', async () => {
    expect(await start(trade.world.reviewer)).toEqual({ ok: false, error: 'forbidden' })
    expect(await handle.db.select().from(paymentAttempts)).toHaveLength(0)
  })

  it('refuses when nothing is due', async () => {
    const started = await start()
    if (!started.ok) throw new Error('start failed')
    await settle(started.value.attemptId, 'captured')
    expect(await start()).toEqual({ ok: false, error: 'nothing_due' })
  })
})

describe('card at the counter with no reader', () => {
  it('refuses when no processor is set up', async () => {
    expect(await start()).toEqual({ ok: false, error: 'no_reader' })
  })

  it('refuses when the Clover account has no reader device', async () => {
    await setupPayments(handle.db, trade.world.admin, 'clover')
    expect(await start()).toEqual({ ok: false, error: 'no_reader' })
    expect(await handle.db.select().from(paymentAttempts)).toHaveLength(0)
  })
})

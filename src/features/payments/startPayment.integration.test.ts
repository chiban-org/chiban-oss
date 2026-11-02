import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ledgerEntries,
  paymentAttempts,
  processorAccounts,
  receipts,
  simulatedProcessorObjects,
} from '@/db/schema'
import { feeBalance } from '@/features/ledger/feeBalance'
import { paymentReturnStatus } from '@/features/payments/paymentReturn'
import { loadDevCheckout, resolveDevCheckout } from '@/features/payments/simulatedCheckout'
import {
  checkWithProcessor,
  reconnectSimulatedReader,
  resolveSimulatedReader,
  startCardPresentPayment,
  startOnlinePayment,
  voidAttempt,
} from '@/features/payments/startPayment'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld, submittedTrade, type TradeFixture } from '@/test/ledgerFixtures'
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
  await setupPayments(handle.db, world.admin, 'simulated', 'sim_town')
})
afterEach(async () => {
  await handle.drop()
})

const deps = { now: NOW, enabled: true }
const payer = () => ({ applicationIds: [trade.applicationId], payerName: 'Alex Applicant' })
const entries = async () => await handle.db.select().from(ledgerEntries)

async function startOnline() {
  const started = await startOnlinePayment(handle.db, trade.world.applicant, payer(), signal, deps)
  if (!started.ok) throw new Error(JSON.stringify(started.error))
  const [attempt] = await handle.db
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.id, started.value.attemptId))
  return { ...started.value, attempt }
}

async function startReader() {
  const started = await startCardPresentPayment(handle.db, trade.world.staff, payer(), signal, deps)
  if (!started.ok) throw new Error(JSON.stringify(started.error))
  return started.value
}

describe('online payment', () => {
  it('online payment returns a redirect to the simulated checkout and a pending attempt', async () => {
    const { redirectUrl, attempt } = await startOnline()
    expect(attempt).toMatchObject({ state: 'pending', channel: 'card_online', amountCents: 4635 })
    expect(redirectUrl).toBe(`/dev/checkout/${attempt?.processorObjectId}`)
    expect(attempt?.checkoutRef).toBe(attempt?.processorObjectId)
  })

  it('another applicant cannot start a payment on a project they are not party to', async () => {
    const stranger = await staffActor(handle.db, 'applicant')
    const r = await startOnlinePayment(handle.db, stranger, payer(), signal, deps)
    expect(r).toEqual({ ok: false, error: 'not_found' })
  })

  it('starting with nothing due is nothing_due', async () => {
    const first = await startOnline()
    await resolveDevCheckout(
      handle.db,
      first.attempt?.processorObjectId ?? '',
      'approve',
      signal,
      deps,
    )
    const again = await startOnlinePayment(handle.db, trade.world.applicant, payer(), signal, deps)
    expect(again).toEqual({ ok: false, error: 'nothing_due' })
  })

  it('with no active account it is not_configured', async () => {
    await handle.db.update(processorAccounts).set({ isActive: false })
    const r = await startOnlinePayment(handle.db, trade.world.applicant, payer(), signal, deps)
    expect(r).toEqual({ ok: false, error: 'not_configured' })
  })

  it('approving on the checkout page captures and posts 4635', async () => {
    const { attempt } = await startOnline()
    await resolveDevCheckout(handle.db, attempt?.processorObjectId ?? '', 'approve', signal, deps)
    const [entry] = await entries()
    expect(entry).toMatchObject({ entryType: 'payment', amountCents: 4635, method: 'card_online' })
    expect((await feeBalance(handle.db, trade.applicationId, signal)).dueCents).toBe(0)
    expect(await paymentReturnStatus(handle.db, attempt?.id ?? '', signal)).toBe('received')
  })

  it('declining posts nothing and leaves the fee due', async () => {
    const { attempt } = await startOnline()
    await resolveDevCheckout(handle.db, attempt?.processorObjectId ?? '', 'decline', signal, deps)
    expect(await entries()).toHaveLength(0)
    expect((await feeBalance(handle.db, trade.applicationId, signal)).dueCents).toBe(4500)
    expect(await paymentReturnStatus(handle.db, attempt?.id ?? '', signal)).toBe('declined')
  })

  it('return page state for a pending attempt is processing, not paid', async () => {
    const { attempt } = await startOnline()
    expect(await paymentReturnStatus(handle.db, attempt?.id ?? '', signal)).toBe('processing')
    expect(await entries()).toHaveLength(0)
  })

  it('the simulated receipt says no card was charged', async () => {
    const { attempt } = await startOnline()
    await resolveDevCheckout(handle.db, attempt?.processorObjectId ?? '', 'approve', signal, deps)
    expect(await handle.db.select({ simulated: receipts.simulated }).from(receipts)).toEqual([
      { simulated: true },
    ])
  })

  it('dev checkout page is unavailable when the flag is off', async () => {
    const { attempt } = await startOnline()
    const objectId = attempt?.processorObjectId ?? ''
    expect(await loadDevCheckout(handle.db, objectId, { enabled: false }, signal)).toBeNull()
    expect(await loadDevCheckout(handle.db, objectId, { enabled: true }, signal)).toMatchObject({
      amountCents: 4635,
      status: 'pending',
    })
  })

  it('resolving a checkout while the flag is off changes nothing', async () => {
    const { attempt } = await startOnline()
    const r = await resolveDevCheckout(
      handle.db,
      attempt?.processorObjectId ?? '',
      'approve',
      signal,
      {
        ...deps,
        enabled: false,
      },
    )
    expect(r).toEqual({ ok: false, error: 'not_found' })
    expect(await entries()).toHaveLength(0)
  })
})

describe('card present at the counter', () => {
  it('card-present start by a reviewer is forbidden', async () => {
    const r = await startCardPresentPayment(handle.db, trade.world.reviewer, payer(), signal, deps)
    expect(r).toEqual({ ok: false, error: 'forbidden' })
  })

  it('reader approval captures and posts the payment from the reader source', async () => {
    const started = await startReader()
    expect(started).toMatchObject({ state: 'pending', outcomeUnknown: false })
    const resolved = await resolveSimulatedReader(
      handle.db,
      trade.world.staff,
      { attemptId: started.attemptId, outcome: 'captured' },
      signal,
      deps,
    )
    expect(resolved.ok && resolved.value.state).toBe('captured')
    expect(await entries()).toMatchObject([{ method: 'card_present', amountCents: 4635 }])
  })

  it('reader decline posts nothing', async () => {
    const started = await startReader()
    await resolveSimulatedReader(
      handle.db,
      trade.world.staff,
      { attemptId: started.attemptId, outcome: 'declined' },
      signal,
      deps,
    )
    expect(await entries()).toHaveLength(0)
  })

  it('reader unknown sets outcome_unknown and posts nothing', async () => {
    const started = await startReader()
    const resolved = await resolveSimulatedReader(
      handle.db,
      trade.world.staff,
      { attemptId: started.attemptId, outcome: 'unknown' },
      signal,
      deps,
    )
    expect(resolved.ok && resolved.value).toMatchObject({ state: 'pending', outcomeUnknown: true })
    expect(await entries()).toHaveLength(0)
    expect((await feeBalance(handle.db, trade.applicationId, signal)).unknownAttempts).toBe(1)
  })

  it('checkWithProcessor after the reader reconnects with approval captures', async () => {
    const started = await startReader()
    await resolveSimulatedReader(
      handle.db,
      trade.world.staff,
      { attemptId: started.attemptId, outcome: 'unknown' },
      signal,
      deps,
    )
    await reconnectSimulatedReader(
      handle.db,
      trade.world.staff,
      { attemptId: started.attemptId, outcome: 'captured' },
      signal,
    )
    const checked = await checkWithProcessor(
      handle.db,
      trade.world.staff,
      started.attemptId,
      signal,
      deps,
    )
    expect(checked.ok && checked.value).toMatchObject({ state: 'captured', outcomeUnknown: false })
    expect(await entries()).toHaveLength(1)
  })

  it('checkWithProcessor by a reviewer is forbidden', async () => {
    const started = await startReader()
    const r = await checkWithProcessor(
      handle.db,
      trade.world.reviewer,
      started.attemptId,
      signal,
      deps,
    )
    expect(r).toEqual({ ok: false, error: 'forbidden' })
  })

  it('void of an unknown attempt is refused until the processor reports not_found', async () => {
    const started = await startReader()
    await resolveSimulatedReader(
      handle.db,
      trade.world.staff,
      { attemptId: started.attemptId, outcome: 'unknown' },
      signal,
      deps,
    )
    const finance = await staffActor(handle.db, 'finance')
    const input = { attemptId: started.attemptId, reason: 'Reader never completed the sale' }
    expect(await voidAttempt(handle.db, finance, input, signal, deps)).toEqual({
      ok: false,
      error: 'outcome_unknown',
    })
    await handle.db.delete(simulatedProcessorObjects)
    const voided = await voidAttempt(handle.db, finance, input, signal, deps)
    expect(voided.ok).toBe(true)
    const [attempt] = await handle.db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, started.attemptId))
    expect(attempt).toMatchObject({ state: 'voided', outcomeUnknown: false })
  })

  it('staff cannot void an attempt', async () => {
    const started = await startReader()
    const r = await voidAttempt(
      handle.db,
      trade.world.staff,
      { attemptId: started.attemptId, reason: 'Customer walked away' },
      signal,
      deps,
    )
    expect(r).toEqual({ ok: false, error: 'forbidden' })
  })

  it('void of an abandoned pending attempt marks it voided', async () => {
    const started = await startReader()
    const finance = await staffActor(handle.db, 'finance')
    const r = await voidAttempt(
      handle.db,
      finance,
      { attemptId: started.attemptId, reason: 'Customer walked away' },
      signal,
      deps,
    )
    expect(r.ok).toBe(true)
    expect((await feeBalance(handle.db, trade.applicationId, signal)).pendingAttempts).toBe(0)
  })
})

import { createHmac } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ledgerEntries, paymentAttempts } from '@/db/schema'
import { handleWebhook } from '@/features/payments/handleWebhook'
import { getActiveProcessor, saveProcessorAccount } from '@/features/payments/processorAccounts'
import { CLOVER_ADAPTER_STATUS } from '@/features/payments/processors/clover'
import { createProcessor } from '@/features/payments/processors/registry'
import type { PaymentProcessor } from '@/features/payments/processors/types'
import { reconcileAttempt } from '@/features/payments/reconcileAttempt'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { type CloverFakeServer, startCloverFakeServer } from '@/test/fakes/cloverFakeServer'
import refunded from '@/test/fixtures/clover/payment_refunded.json'
import closed from '@/test/fixtures/clover/payment_success_closed.json'
import webhookPayment from '@/test/fixtures/clover/webhook_payment.json'
import { setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { makeCardAttempt, PAYMENT_SETTINGS } from '@/test/paymentFixtures'

const signal = new AbortController().signal
const TOKEN = 'clover_private_token'
const SIGNING_SECRET = 'clover_signing_secret'
const MERCHANT = 'MERCHANT1ALDER'
const NOW = new Date('2027-03-02T17:00:00Z')
let server: CloverFakeServer
let handle: TestDb
let accountId: string
let processor: PaymentProcessor
let trade: Awaited<ReturnType<typeof submittedTrade>>

beforeAll(async () => {
  server = await startCloverFakeServer({ token: TOKEN, merchantId: MERCHANT })
})
afterAll(async () => {
  await server.stop()
})
beforeEach(async () => {
  handle = await makeTestDb()
  const { world } = await setupTradeWorld(handle.db)
  trade = await submittedTrade(handle.db, world)
  await saveAndPublish(handle.db, world.admin, 'payment_settings', 'default', PAYMENT_SETTINGS)
  const saved = await saveProcessorAccount(
    handle.db,
    world.admin,
    {
      processor: 'clover',
      mode: 'test',
      accountRef: MERCHANT,
      settings: { apiBase: server.apiBase, ecommBase: server.ecommBase, deviceId: 'device-1' },
      credentials: { privateToken: TOKEN, webhookSigningSecret: SIGNING_SECRET },
      webhookSecret: SIGNING_SECRET,
    },
    signal,
  )
  if (!saved.ok) throw new Error('save failed')
  accountId = saved.value.accountId
  const active = await getActiveProcessor(handle.db, signal)
  if (active.state !== 'known') throw new Error('account not readable')
  processor = createProcessor(active.value.account, active.value.credentials, {
    db: handle.db,
    fetch,
    cardPresentTimeoutMs: 300,
  })
})
afterEach(async () => {
  server.reset()
  await handle.drop()
})

function signedWebhook(secret: string, body: object = webhookPayment, at: Date = NOW) {
  const raw = JSON.stringify(body)
  const t = Math.floor(at.getTime() / 1000)
  const v1 = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')
  return { raw, headers: new Headers({ 'clover-signature': `t=${t},v1=${v1}` }) }
}

describe('clover adapter against the local fake', () => {
  it('adapter reports stubbed', () => {
    expect(CLOVER_ADAPTER_STATUS).toBe('stubbed')
  })

  it('connect verifies the merchant id', async () => {
    const verified = await processor.verifyAccount(signal)
    expect(verified).toEqual({ ok: true, value: { accountRef: MERCHANT } })
  })

  it('a wrong bearer token is rejected by the fake and never skipped', async () => {
    const active = await getActiveProcessor(handle.db, signal)
    if (active.state !== 'known') throw new Error('unreadable')
    const wrong = createProcessor(
      active.value.account,
      { privateToken: 'nope', webhookSigningSecret: 'x' },
      { db: handle.db, fetch },
    )
    const verified = await wrong.verifyAccount(signal)
    expect(verified).toMatchObject({ ok: false, error: { kind: 'rejected' } })
  })

  it('first run creates a checkout and returns the href', async () => {
    const created = await processor.createOnlineCheckout(
      {
        attemptId: 'att_1',
        amountCents: 4635,
        description: 'Alder Pond permit fees',
        returnUrl: 'https://alderpond.example/return',
        cancelUrl: 'https://alderpond.example/cancel',
        idempotencyKey: 'k1',
      },
      signal,
    )
    expect(created).toEqual({
      ok: true,
      value: {
        checkoutRef: 'session-abc123',
        redirectUrl: 'https://checkout.clover.example/checkout/session-abc123',
        objectId: null,
      },
    })
    const post = server.requests.find((r) => r.path === '/invoicingcheckoutservice/v1/checkouts')
    expect(post?.body).toMatchObject({
      shoppingCart: { lineItems: [{ name: 'Alder Pond permit fees', price: 4635, unitQty: 1 }] },
    })
    expect(post?.headers['x-clover-merchant-id']).toBe(MERCHANT)
  })

  it('second run reconciles the same payment to the same single entry', async () => {
    const { attemptId } = await makeCardAttempt(handle.db, trade)
    await handle.db.update(paymentAttempts).set({ checkoutRef: 'session-abc123' })
    server.setPayment('PAYMENT1ALDER', closed)
    const { raw, headers } = signedWebhook(SIGNING_SECRET)
    const first = await handleWebhook(
      handle.db,
      { now: NOW },
      { accountId, rawBody: raw, headers },
      signal,
    )
    expect(first.status).toBe(200)
    const state = await processor.getPaymentState('PAYMENT1ALDER', signal)
    if (!state.ok) throw new Error('state failed')
    const second = await handle.db.transaction((tx) =>
      reconcileAttempt(tx, attemptId, state.value, { kind: 'reconcile' }, signal, NOW),
    )
    expect(second).toEqual({ ok: true, value: { state: 'settled', entriesPosted: 0 } })
    const entries = await handle.db.select().from(ledgerEntries)
    expect(entries).toMatchObject([
      { entryType: 'payment', amountCents: 4635, processorObjectId: 'PAYMENT1ALDER' },
    ])
    const [attempt] = await handle.db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, attemptId))
    expect(attempt?.processorObjectId).toBe('PAYMENT1ALDER')
  })

  it('webhook signed with the signing secret verifies; one signed with another secret is bad_signature', () => {
    const good = signedWebhook(SIGNING_SECRET)
    const verified = processor.verifyWebhook({
      rawBody: good.raw,
      headers: good.headers,
      secret: SIGNING_SECRET,
      now: NOW,
    })
    expect(verified).toMatchObject({
      ok: true,
      value: {
        type: 'PAYMENT',
        objectId: 'PAYMENT1ALDER',
        checkoutRef: 'session-abc123',
        accountRef: MERCHANT,
        livemode: false,
      },
    })
    const bad = signedWebhook('another_secret')
    expect(
      processor.verifyWebhook({
        rawBody: bad.raw,
        headers: bad.headers,
        secret: SIGNING_SECRET,
        now: NOW,
      }),
    ).toEqual({
      ok: false,
      error: 'bad_signature',
    })
  })

  it('the event id is the sha256 of the raw body', () => {
    const good = signedWebhook(SIGNING_SECRET)
    const verified = processor.verifyWebhook({
      rawBody: good.raw,
      headers: good.headers,
      secret: SIGNING_SECRET,
      now: NOW,
    })
    expect(verified.ok && verified.value.eventId).toMatch(/^[0-9a-f]{64}$/)
  })

  it('a signature older than 300 seconds is stale_timestamp', () => {
    const old = signedWebhook(SIGNING_SECRET, webhookPayment, new Date(NOW.getTime() - 301_000))
    expect(
      processor.verifyWebhook({
        rawBody: old.raw,
        headers: old.headers,
        secret: SIGNING_SECRET,
        now: NOW,
      }),
    ).toEqual({
      ok: false,
      error: 'stale_timestamp',
    })
  })

  it('a missing signature header is bad_signature', () => {
    const { raw } = signedWebhook(SIGNING_SECRET)
    expect(
      processor.verifyWebhook({
        rawBody: raw,
        headers: new Headers(),
        secret: SIGNING_SECRET,
        now: NOW,
      }),
    ).toEqual({
      ok: false,
      error: 'bad_signature',
    })
  })

  it('card-present timeout returns outcome unknown', async () => {
    server.setCardPresent('timeout')
    const started = await processor.startCardPresent(
      { attemptId: 'att_2', amountCents: 4635, idempotencyKey: 'cp-1' },
      signal,
    )
    expect(started).toEqual({ ok: true, value: { outcome: 'unknown' } })
  })

  it('card-present server error returns outcome unknown', async () => {
    server.setCardPresent('error')
    const started = await processor.startCardPresent(
      { attemptId: 'att_2', amountCents: 4635, idempotencyKey: 'cp-1' },
      signal,
    )
    expect(started).toEqual({ ok: true, value: { outcome: 'unknown' } })
  })

  it('card-present start sends the device, pos id, and idempotency headers', async () => {
    const started = await processor.startCardPresent(
      { attemptId: 'att_2', amountCents: 4635, idempotencyKey: 'cp-9' },
      signal,
    )
    expect(started).toEqual({ ok: true, value: { objectId: 'PAYMENT_CARD_PRESENT' } })
    const post = server.requests.find((r) => r.path === '/connect/v1/payments')
    expect(post?.headers).toMatchObject({
      'x-clover-device-id': 'device-1',
      'x-pos-id': 'chiban',
      'idempotency-key': 'cp-9',
    })
    expect(post?.body).toEqual({ amount: 4635, final: true, externalPaymentId: 'att_2' })
  })

  it('refund returns the refund id and getPaymentState lists it', async () => {
    server.setPayment('PAYMENT1ALDER', closed)
    const refund = await processor.refund(
      { objectId: 'PAYMENT1ALDER', amountCents: 1000, idempotencyKey: 'rf-1' },
      signal,
    )
    expect(refund).toEqual({
      ok: true,
      value: { refundObjectId: 'REFUND1ALDER', status: 'succeeded' },
    })
    server.setPayment('PAYMENT1ALDER', refunded)
    const state = await processor.getPaymentState('PAYMENT1ALDER', signal)
    expect(state.ok && state.value.refunds).toEqual([
      { objectId: 'REFUND1ALDER', amountCents: 1000, status: 'succeeded' },
    ])
  })

  it('an unknown payment is not_found', async () => {
    const state = await processor.getPaymentState('NOPE', signal)
    expect(state).toEqual({ ok: false, error: { kind: 'not_found' } })
  })

  it('cancelAuthorization is unsupported', async () => {
    expect(await processor.cancelAuthorization('PAYMENT1ALDER', signal)).toMatchObject({
      ok: false,
      error: { kind: 'unsupported' },
    })
  })
})

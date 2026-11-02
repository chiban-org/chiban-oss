import Stripe from 'stripe'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getActiveProcessor, saveProcessorAccount } from '@/features/payments/processorAccounts'
import { createProcessor } from '@/features/payments/processors/registry'
import type { PaymentProcessor } from '@/features/payments/processors/types'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { type StripeMock, startStripeMock } from '@/test/stripeMock'

const signal = new AbortController().signal
const SECRET_KEY = 'sk_test_123'
const WEBHOOK_SECRET = 'whsec_e2e'
const NOW = new Date('2027-03-02T17:00:00Z')
let mock: StripeMock
let handle: TestDb
let requests: { url: string; headers: Headers }[]
let processor: PaymentProcessor

beforeAll(async () => {
  mock = await startStripeMock()
})
afterAll(async () => {
  await mock.stop()
})
beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  requests = []
  const admin = await staffActor(handle.db, 'admin')
  const saved = await saveProcessorAccount(
    handle.db,
    admin,
    {
      processor: 'stripe',
      mode: 'test',
      accountRef: 'acct_pending_verification',
      settings: { deviceId: 'tmr_123' },
      credentials: { secretKey: SECRET_KEY },
      webhookSecret: WEBHOOK_SECRET,
    },
    signal,
  )
  expect(saved.ok).toBe(true)
  const active = await getActiveProcessor(handle.db, signal)
  if (active.state !== 'known') throw new Error('account not readable')
  processor = createProcessor(active.value.account, active.value.credentials, {
    db: handle.db,
    stripeApiBase: mock.apiBase,
    fetch: (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      requests.push({ url, headers: new Headers(init?.headers) })
      return fetch(input, init)
    },
  })
})
afterEach(async () => {
  await handle.drop()
})

const checkout = (key: string) => ({
  attemptId: 'att_1',
  amountCents: 4635,
  description: 'Alder Pond permit fees',
  returnUrl: 'https://alderpond.example/payments/return/att_1',
  cancelUrl: 'https://alderpond.example/payments/cancel/att_1',
  idempotencyKey: key,
})

describe('stripe adapter against stripe-mock', () => {
  it('connect returns an acct_ account ref', async () => {
    const verified = await processor.verifyAccount(signal)
    expect(verified.ok && verified.value.accountRef).toMatch(/^acct_/)
  })

  it('first run creates a checkout session with a redirect url and the idempotency key header', async () => {
    const created = await processor.createOnlineCheckout(checkout('key-first'), signal)
    expect(created.ok && created.value.redirectUrl).toMatch(/^https:\/\/checkout\.stripe\.com\//)
    expect(created.ok && created.value.checkoutRef).toMatch(/^cs_/)
    const post = requests.find((r) => r.url.includes('/v1/checkout/sessions'))
    expect(post?.headers.get('idempotency-key')).toBe('key-first')
  })

  it('second run with the same idempotency key succeeds', async () => {
    const first = await processor.createOnlineCheckout(checkout('key-same'), signal)
    const second = await processor.createOnlineCheckout(checkout('key-same'), signal)
    expect(first.ok && second.ok).toBe(true)
  })

  it('resolveCheckout returns the payment intent object id', async () => {
    const resolved = await processor.resolveCheckout('cs_test_123', signal)
    expect(resolved.ok && resolved.value.objectId).toMatch(/^pi_/)
  })

  it('getPaymentState parses the retrieved intent and lists', async () => {
    const state = await processor.getPaymentState('pi_123', signal)
    expect(state.ok && state.value).toMatchObject({
      objectId: 'pi_123',
      accountRef: 'acct_pending_verification',
      status: 'pending',
      amountCents: 1099,
    })
    expect(state.ok && state.value.refunds.length).toBeGreaterThan(0)
  })

  it('refund returns a re_ object id', async () => {
    const refund = await processor.refund(
      { objectId: 'pi_123', amountCents: 500, idempotencyKey: 'refund-1' },
      signal,
    )
    expect(refund.ok && refund.value.refundObjectId).toMatch(/^re_/)
  })

  it('cancelAuthorization cancels the intent', async () => {
    expect((await processor.cancelAuthorization('pi_123', signal)).ok).toBe(true)
  })

  it('card present start returns the payment intent id', async () => {
    const started = await processor.startCardPresent(
      { attemptId: 'att_2', amountCents: 4635, idempotencyKey: 'cp-1' },
      signal,
    )
    expect(started).toMatchObject({ ok: true, value: { objectId: expect.stringMatching(/^pi_/) } })
  })

  it('an unreachable processor on card present start is an unknown outcome', async () => {
    const active = await getActiveProcessor(handle.db, signal)
    if (active.state !== 'known') throw new Error('account not readable')
    const down = createProcessor(active.value.account, active.value.credentials, {
      db: handle.db,
      stripeApiBase: 'http://127.0.0.1:1',
      fetch,
    })
    const started = await down.startCardPresent(
      { attemptId: 'att_3', amountCents: 4635, idempotencyKey: 'cp-2' },
      signal,
    )
    expect(started).toEqual({ ok: true, value: { outcome: 'unknown' } })
  })
})

describe('stripe webhook signatures', () => {
  const stripe = new Stripe(SECRET_KEY)
  const payload = JSON.stringify({
    id: 'evt_sig_1',
    object: 'event',
    type: 'charge.refunded',
    livemode: false,
    account: 'acct_alder',
    data: { object: { id: 'ch_1', object: 'charge', payment_intent: 'pi_9' } },
  })
  const headersFor = (header: string) => new Headers({ 'stripe-signature': header })

  it('a header from generateTestHeaderString verifies', () => {
    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
      timestamp: Math.floor(NOW.getTime() / 1000),
    })
    const verified = processor.verifyWebhook({
      rawBody: payload,
      headers: headersFor(header),
      secret: WEBHOOK_SECRET,
      now: NOW,
    })
    expect(verified).toEqual({
      ok: true,
      value: {
        eventId: 'evt_sig_1',
        type: 'charge.refunded',
        objectId: 'pi_9',
        checkoutRef: null,
        accountRef: 'acct_alder',
        livemode: false,
      },
    })
  })

  it('a header older than 300 seconds is stale_timestamp', () => {
    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
      timestamp: Math.floor(NOW.getTime() / 1000) - 301,
    })
    const verified = processor.verifyWebhook({
      rawBody: payload,
      headers: headersFor(header),
      secret: WEBHOOK_SECRET,
      now: NOW,
    })
    expect(verified).toEqual({ ok: false, error: 'stale_timestamp' })
  })

  it('a flipped body byte is bad_signature', () => {
    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
      timestamp: Math.floor(NOW.getTime() / 1000),
    })
    const tampered = payload.replace('pi_9', 'pi_8')
    const verified = processor.verifyWebhook({
      rawBody: tampered,
      headers: headersFor(header),
      secret: WEBHOOK_SECRET,
      now: NOW,
    })
    expect(verified).toEqual({ ok: false, error: 'bad_signature' })
  })

  it('a missing signature header is bad_signature', () => {
    const verified = processor.verifyWebhook({
      rawBody: payload,
      headers: new Headers(),
      secret: WEBHOOK_SECRET,
      now: NOW,
    })
    expect(verified).toEqual({ ok: false, error: 'bad_signature' })
  })

  it('checkout.session.completed maps the checkout ref and the payment intent', () => {
    const body = JSON.stringify({
      id: 'evt_cs',
      object: 'event',
      type: 'checkout.session.completed',
      livemode: false,
      data: { object: { id: 'cs_9', object: 'checkout.session', payment_intent: 'pi_9' } },
    })
    const header = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: WEBHOOK_SECRET,
      timestamp: Math.floor(NOW.getTime() / 1000),
    })
    const verified = processor.verifyWebhook({
      rawBody: body,
      headers: headersFor(header),
      secret: WEBHOOK_SECRET,
      now: NOW,
    })
    expect(verified.ok && verified.value).toMatchObject({
      checkoutRef: 'cs_9',
      objectId: 'pi_9',
      accountRef: null,
    })
  })
})

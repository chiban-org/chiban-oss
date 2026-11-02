import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  PaymentProcessor,
  ProcessorPaymentState,
  ProcessorWebhookEvent,
} from '@/features/payments/processors/types'
import { err, ok } from '@/types/result'

const TOLERANCE_SECONDS = 300

export interface FakeProcessor extends PaymentProcessor {
  setState(objectId: string, state: ProcessorPaymentState): void
  setCheckoutObject(checkoutRef: string, objectId: string): void
  refunds: { objectId: string; amountCents: number }[]
  lastCheckoutKey: string | null
}

export function signFakePayload(secret: string, rawBody: string, at: Date): string {
  const t = Math.floor(at.getTime() / 1000)
  const v1 = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
  return `t=${t},v1=${v1}`
}

export function createFakeProcessor(accountRef = 'acct_alder'): FakeProcessor {
  const states = new Map<string, ProcessorPaymentState>()
  const checkouts = new Map<string, string>()
  const refunds: { objectId: string; amountCents: number }[] = []
  let refundCounter = 0
  const fake: FakeProcessor = {
    processor: 'stripe',
    refunds,
    lastCheckoutKey: null,
    setState: (objectId, state) => {
      states.set(objectId, state)
    },
    setCheckoutObject: (checkoutRef, objectId) => {
      checkouts.set(checkoutRef, objectId)
    },
    verifyAccount: () => Promise.resolve(ok({ accountRef })),
    createOnlineCheckout: (input) => {
      fake.lastCheckoutKey = input.idempotencyKey
      return Promise.resolve(
        ok({
          checkoutRef: `cs_${input.attemptId}`,
          redirectUrl: `https://checkout.fake/${input.attemptId}`,
          objectId: null,
        }),
      )
    },
    resolveCheckout: (checkoutRef) =>
      Promise.resolve(ok({ objectId: checkouts.get(checkoutRef) ?? null })),
    startCardPresent: (input) => Promise.resolve(ok({ objectId: `pi_${input.attemptId}` })),
    getPaymentState: (objectId) => {
      const state = states.get(objectId)
      return Promise.resolve(state === undefined ? err({ kind: 'not_found' as const }) : ok(state))
    },
    refund: (input) => {
      refundCounter += 1
      refunds.push({ objectId: input.objectId, amountCents: input.amountCents })
      return Promise.resolve(ok({ refundObjectId: `re_fake_${refundCounter}` }))
    },
    cancelAuthorization: () => Promise.resolve(ok(undefined)),
    verifyWebhook: ({ rawBody, headers, secret, now }) => {
      const header = headers.get('x-fake-signature') ?? ''
      const parts = new Map(header.split(',').map((p) => p.split('=') as [string, string]))
      const t = Number(parts.get('t'))
      const v1 = parts.get('v1') ?? ''
      if (!Number.isFinite(t) || v1 === '') return err('malformed' as const)
      if (Math.abs(now.getTime() / 1000 - t) > TOLERANCE_SECONDS)
        return err('stale_timestamp' as const)
      const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest()
      const given = Buffer.from(v1, 'hex')
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return err('bad_signature' as const)
      }
      let body: Partial<ProcessorWebhookEvent>
      try {
        body = JSON.parse(rawBody) as Partial<ProcessorWebhookEvent>
      } catch {
        return err('malformed' as const)
      }
      return ok({
        eventId: body.eventId ?? '',
        type: body.type ?? 'unknown',
        objectId: body.objectId ?? null,
        checkoutRef: body.checkoutRef ?? null,
        accountRef: body.accountRef ?? null,
        livemode: body.livemode ?? false,
      })
    },
  }
  return fake
}

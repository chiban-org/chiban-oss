import Stripe from 'stripe'
import { z } from 'zod'
import type { ProcessorAccountRow } from '@/db/schema'
import { mapStripeState } from '@/features/payments/processors/stripeState'
import type {
  PaymentProcessor,
  ProcessorError,
  ProcessorWebhookEvent,
  RefundStatus,
} from '@/features/payments/processors/types'
import { err, ok, type Result } from '@/types/result'

export const StripeCredentialsSchema = z.object({ secretKey: z.string().min(1) })
export type StripeCredentials = z.infer<typeof StripeCredentialsSchema>

const SIGNATURE_TOLERANCE_SECONDS = 300
const LIST_LIMIT = 100

const ClientSettingsSchema = z.object({ deviceId: z.string().min(1).optional() })

export interface StripeDeps {
  fetch: typeof fetch
  apiBase?: string
}

function clientFor(credentials: StripeCredentials, deps: StripeDeps): Stripe {
  const base = deps.apiBase === undefined ? null : new URL(deps.apiBase)
  return new Stripe(credentials.secretKey, {
    httpClient: Stripe.createFetchHttpClient(deps.fetch),
    ...(base === null
      ? {}
      : {
          host: base.hostname,
          port: Number(base.port),
          protocol: base.protocol.replace(':', '') as 'http' | 'https',
        }),
  })
}

function toProcessorError(e: unknown): ProcessorError {
  if (e instanceof Stripe.errors.StripeConnectionError) {
    return { kind: 'unreachable', detail: e.message }
  }
  if (e instanceof Stripe.errors.StripeError) return { kind: 'rejected', detail: e.message }
  return { kind: 'unreachable', detail: e instanceof Error ? e.message : 'unknown failure' }
}

async function call<T>(fn: () => Promise<T>): Promise<Result<T, ProcessorError>> {
  try {
    return ok(await fn())
  } catch (e) {
    return err(toProcessorError(e))
  }
}

function refundStatusOf(status: string | null): RefundStatus {
  if (status === 'succeeded') return 'succeeded'
  return status === 'failed' || status === 'canceled' ? 'failed' : 'pending'
}

function paymentIntentId(value: string | { id: string } | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return typeof value === 'string' ? value : value.id
}

function webhookObject(event: Stripe.Event): {
  objectId: string | null
  checkoutRef: string | null
} {
  const object = event.data.object as unknown as Record<string, unknown>
  const type = event.type
  const asId = (v: unknown) => (typeof v === 'string' ? v : null)
  if (type.startsWith('checkout.session.')) {
    return { objectId: asId(object.payment_intent), checkoutRef: asId(object.id) }
  }
  if (type.startsWith('payment_intent.')) return { objectId: asId(object.id), checkoutRef: null }
  return { objectId: asId(object.payment_intent), checkoutRef: null }
}

export function createStripeProcessor(
  credentials: StripeCredentials,
  account: Pick<ProcessorAccountRow, 'accountRef' | 'settings'>,
  deps: StripeDeps,
): PaymentProcessor {
  const stripe = clientFor(credentials, deps)
  const settings = ClientSettingsSchema.safeParse(account.settings)
  const deviceId = settings.success ? settings.data.deviceId : undefined
  return {
    processor: 'stripe',
    verifyAccount: async () => {
      const retrieved = await call(() => stripe.accounts.retrieveCurrent())
      return retrieved.ok ? ok({ accountRef: retrieved.value.id }) : retrieved
    },
    createOnlineCheckout: async (input) => {
      const session = await call(() =>
        stripe.checkout.sessions.create(
          {
            mode: 'payment',
            line_items: [
              {
                price_data: {
                  currency: 'usd',
                  unit_amount: input.amountCents,
                  product_data: { name: input.description },
                },
                quantity: 1,
              },
            ],
            success_url: input.returnUrl,
            cancel_url: input.cancelUrl,
            client_reference_id: input.attemptId,
            metadata: { attemptId: input.attemptId },
          },
          { idempotencyKey: input.idempotencyKey },
        ),
      )
      if (!session.ok) return session
      if (session.value.url === null) {
        return err({ kind: 'bad_shape' as const, detail: 'checkout session has no url' })
      }
      return ok({
        checkoutRef: session.value.id,
        redirectUrl: session.value.url,
        objectId: paymentIntentId(session.value.payment_intent),
      })
    },
    resolveCheckout: async (checkoutRef) => {
      const session = await call(() => stripe.checkout.sessions.retrieve(checkoutRef))
      return session.ok ? ok({ objectId: paymentIntentId(session.value.payment_intent) }) : session
    },
    startCardPresent: async (input) => {
      if (deviceId === undefined) {
        return err({ kind: 'unsupported' as const, detail: 'No reader device is configured' })
      }
      const intent = await call(() =>
        stripe.paymentIntents.create(
          {
            amount: input.amountCents,
            currency: 'usd',
            allowed_payment_method_types: ['card_present'],
            capture_method: 'automatic',
            metadata: { attemptId: input.attemptId },
          },
          { idempotencyKey: input.idempotencyKey },
        ),
      )
      if (!intent.ok) {
        return intent.error.kind === 'unreachable' ? ok({ outcome: 'unknown' as const }) : intent
      }
      const started = await call(() =>
        stripe.terminal.readers.processPaymentIntent(deviceId, { payment_intent: intent.value.id }),
      )
      if (!started.ok && started.error.kind !== 'unreachable') return started
      return ok({ objectId: intent.value.id })
    },
    getPaymentState: async (objectId) => {
      const loaded = await call(async () => ({
        intent: await stripe.paymentIntents.retrieve(objectId, {
          expand: ['latest_charge.balance_transaction'],
        }),
        refunds: await stripe.refunds.list({ payment_intent: objectId, limit: LIST_LIMIT }),
        disputes: await stripe.disputes.list({ payment_intent: objectId, limit: LIST_LIMIT }),
      }))
      if (!loaded.ok) return loaded
      return mapStripeState(
        loaded.value.intent,
        loaded.value.refunds,
        loaded.value.disputes,
        account.accountRef,
      )
    },
    refund: async (input) => {
      const refund = await call(() =>
        stripe.refunds.create(
          { payment_intent: input.objectId, amount: input.amountCents },
          { idempotencyKey: input.idempotencyKey },
        ),
      )
      return refund.ok
        ? ok({ refundObjectId: refund.value.id, status: refundStatusOf(refund.value.status) })
        : refund
    },
    cancelAuthorization: async (objectId) => {
      const canceled = await call(() => stripe.paymentIntents.cancel(objectId))
      return canceled.ok ? ok(undefined) : canceled
    },
    verifyWebhook: ({ rawBody, headers, secret, now }) => {
      const header = headers.get('stripe-signature')
      if (header === null) return err('bad_signature')
      try {
        const event = stripe.webhooks.constructEvent(
          rawBody,
          header,
          secret,
          SIGNATURE_TOLERANCE_SECONDS,
          undefined,
          now.getTime(),
        )
        const refs = webhookObject(event)
        const verified: ProcessorWebhookEvent = {
          eventId: event.id,
          type: event.type,
          objectId: refs.objectId,
          checkoutRef: refs.checkoutRef,
          accountRef: event.account ?? null,
          livemode: event.livemode,
        }
        return ok(verified)
      } catch (e) {
        if (e instanceof Stripe.errors.StripeSignatureVerificationError) {
          return err(/tolerance/i.test(e.message) ? 'stale_timestamp' : 'bad_signature')
        }
        return err('malformed')
      }
    },
  }
}

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { ProcessorAccountRow } from '@/db/schema'
import { mapCloverState } from '@/features/payments/processors/cloverState'
import type {
  PaymentProcessor,
  ProcessorError,
  ProcessorWebhookEvent,
} from '@/features/payments/processors/types'
import { err, ok, type Result } from '@/types/result'

export const CLOVER_ADAPTER_STATUS = 'stubbed' as const

export const CloverCredentialsSchema = z.object({
  privateToken: z.string().min(1),
  webhookSigningSecret: z.string().min(1),
})
export type CloverCredentials = z.infer<typeof CloverCredentialsSchema>

export const CloverSettingsSchema = z.object({
  apiBase: z.url(),
  ecommBase: z.url(),
  deviceId: z.string().min(1).optional(),
})

const SIGNATURE_TOLERANCE_SECONDS = 300
const DEFAULT_CARD_PRESENT_TIMEOUT_MS = 30_000
const REQUEST_TIMEOUT_MS = 15_000
const POS_ID = 'chiban'

const MerchantSchema = z.object({ id: z.string().min(1) })
const CheckoutSchema = z.object({ href: z.string().min(1), checkoutSessionId: z.string().min(1) })
const RefundSchema = z.object({ id: z.string().min(1) })
const CardPresentSchema = z.object({ id: z.string().min(1) })
const WebhookSchema = z.object({
  type: z.string(),
  id: z.string().min(1),
  merchantId: z.string().min(1),
  data: z.string().nullish(),
})

export interface CloverDeps {
  fetch: typeof fetch
  cardPresentTimeoutMs?: number
}

type CloverAccount = Pick<ProcessorAccountRow, 'accountRef' | 'settings' | 'mode'>

interface HttpResult {
  status: number
  json: unknown
}

async function send(
  deps: CloverDeps,
  url: string,
  init: { method: string; headers: Record<string, string>; body?: unknown; timeoutMs: number },
  signal: AbortSignal,
): Promise<Result<HttpResult, ProcessorError>> {
  try {
    const response = await deps.fetch(url, {
      method: init.method,
      headers: { 'content-type': 'application/json', ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(init.timeoutMs)]),
    })
    const text = await response.text()
    let json: unknown = null
    try {
      json = text === '' ? null : (JSON.parse(text) as unknown)
    } catch {
      json = null
    }
    return ok({ status: response.status, json })
  } catch (e) {
    return err({ kind: 'unreachable', detail: e instanceof Error ? e.message : 'request failed' })
  }
}

function statusError(result: HttpResult): ProcessorError | null {
  if (result.status >= 500)
    return { kind: 'unreachable', detail: `Clover returned ${result.status}` }
  if (result.status >= 400) return { kind: 'rejected', detail: `Clover returned ${result.status}` }
  return null
}

function parseHeader(header: string): { t: number; v1: string } | null {
  const parts = new Map(header.split(',').map((p) => p.trim().split('=') as [string, string]))
  const t = Number(parts.get('t'))
  const v1 = parts.get('v1')
  return Number.isFinite(t) && v1 !== undefined ? { t, v1 } : null
}

export function createCloverProcessor(
  credentials: CloverCredentials,
  account: CloverAccount,
  deps: CloverDeps,
): PaymentProcessor {
  const settings = CloverSettingsSchema.parse(account.settings)
  const merchantId = account.accountRef
  const auth = { authorization: `Bearer ${credentials.privateToken}` }
  const merchantHeaders = { ...auth, 'x-clover-merchant-id': merchantId }
  const merchantUrl = `${settings.apiBase}/v3/merchants/${encodeURIComponent(merchantId)}`
  const cardPresentTimeout = deps.cardPresentTimeoutMs ?? DEFAULT_CARD_PRESENT_TIMEOUT_MS

  const getJson = async (
    url: string,
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<Result<HttpResult, ProcessorError | { kind: 'not_found' }>> => {
    const sent = await send(
      deps,
      url,
      { method: 'GET', headers, timeoutMs: REQUEST_TIMEOUT_MS },
      signal,
    )
    if (!sent.ok) return sent
    if (sent.value.status === 404) return err({ kind: 'not_found' })
    const failure = statusError(sent.value)
    return failure === null ? sent : err(failure)
  }

  const postJson = async <T>(
    url: string,
    headers: Record<string, string>,
    body: unknown,
    schema: z.ZodType<T>,
    signal: AbortSignal,
  ): Promise<Result<T, ProcessorError>> => {
    const sent = await send(
      deps,
      url,
      { method: 'POST', headers, body, timeoutMs: REQUEST_TIMEOUT_MS },
      signal,
    )
    if (!sent.ok) return sent
    const failure = statusError(sent.value)
    if (failure !== null) return err(failure)
    const parsed = schema.safeParse(sent.value.json)
    return parsed.success
      ? ok(parsed.data)
      : err({ kind: 'bad_shape', detail: parsed.error.message })
  }

  return {
    processor: 'clover',
    verifyAccount: async (signal) => {
      const loaded = await getJson(merchantUrl, auth, signal)
      if (!loaded.ok) {
        return err(
          loaded.error.kind === 'not_found'
            ? { kind: 'rejected' as const, detail: 'Merchant not found' }
            : loaded.error,
        )
      }
      const parsed = MerchantSchema.safeParse(loaded.value.json)
      return parsed.success
        ? ok({ accountRef: parsed.data.id })
        : err({ kind: 'bad_shape' as const, detail: parsed.error.message })
    },
    createOnlineCheckout: async (input, signal) => {
      const created = await postJson(
        `${settings.ecommBase}/invoicingcheckoutservice/v1/checkouts`,
        merchantHeaders,
        {
          shoppingCart: {
            lineItems: [{ name: input.description, price: input.amountCents, unitQty: 1 }],
          },
        },
        CheckoutSchema,
        signal,
      )
      return created.ok
        ? ok({
            checkoutRef: created.value.checkoutSessionId,
            redirectUrl: created.value.href,
            objectId: null,
          })
        : created
    },
    resolveCheckout: () =>
      Promise.resolve(
        err({
          kind: 'unsupported' as const,
          detail: 'Clover reports the payment id in the webhook',
        }),
      ),
    startCardPresent: async (input, signal) => {
      if (settings.deviceId === undefined) {
        return err({ kind: 'unsupported' as const, detail: 'No reader device is configured' })
      }
      const sent = await send(
        deps,
        `${settings.apiBase}/connect/v1/payments`,
        {
          method: 'POST',
          headers: {
            ...merchantHeaders,
            'x-clover-device-id': settings.deviceId,
            'x-pos-id': POS_ID,
            'idempotency-key': input.idempotencyKey,
          },
          body: { amount: input.amountCents, final: true, externalPaymentId: input.attemptId },
          timeoutMs: cardPresentTimeout,
        },
        signal,
      )
      if (!sent.ok || sent.value.status >= 500) return ok({ outcome: 'unknown' as const })
      const failure = statusError(sent.value)
      if (failure !== null) return err(failure)
      const parsed = CardPresentSchema.safeParse(sent.value.json)
      return parsed.success
        ? ok({ objectId: parsed.data.id })
        : err({ kind: 'bad_shape' as const, detail: parsed.error.message })
    },
    getPaymentState: async (objectId, signal) => {
      const loaded = await getJson(
        `${merchantUrl}/payments/${encodeURIComponent(objectId)}?expand=refunds,cardTransaction`,
        auth,
        signal,
      )
      return loaded.ok ? mapCloverState(loaded.value.json, merchantId) : loaded
    },
    refund: async (input, signal) => {
      const refunded = await postJson(
        `${settings.ecommBase}/v1/refunds`,
        { ...merchantHeaders, 'idempotency-key': input.idempotencyKey },
        { charge: input.objectId, amount: input.amountCents },
        RefundSchema,
        signal,
      )
      return refunded.ok ? ok({ refundObjectId: refunded.value.id }) : refunded
    },
    cancelAuthorization: () =>
      Promise.resolve(
        err({ kind: 'unsupported' as const, detail: 'Hosted checkout captures immediately' }),
      ),
    verifyWebhook: ({ rawBody, headers, secret, now }) => {
      const header = headers.get('clover-signature')
      const parsedHeader = header === null ? null : parseHeader(header)
      if (parsedHeader === null) return err('bad_signature')
      const expected = createHmac('sha256', secret).update(`${parsedHeader.t}.${rawBody}`).digest()
      const given = Buffer.from(parsedHeader.v1, 'hex')
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return err('bad_signature')
      }
      if (Math.abs(now.getTime() / 1000 - parsedHeader.t) > SIGNATURE_TOLERANCE_SECONDS) {
        return err('stale_timestamp')
      }
      let json: unknown
      try {
        json = JSON.parse(rawBody)
      } catch {
        return err('malformed')
      }
      const payload = WebhookSchema.safeParse(json)
      if (!payload.success) return err('malformed')
      const event: ProcessorWebhookEvent = {
        eventId: createHash('sha256').update(rawBody).digest('hex'),
        type: payload.data.type,
        objectId: payload.data.id,
        checkoutRef: payload.data.data ?? null,
        accountRef: payload.data.merchantId,
        livemode: account.mode === 'live',
      }
      return ok(event)
    },
  }
}

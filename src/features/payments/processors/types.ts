import type { Processor } from '@/features/ledger/types'
import type { Result } from '@/types/result'

export type ProcessorError = {
  kind: 'unreachable' | 'rejected' | 'bad_shape' | 'unsupported'
  detail: string
}

export type ProcessorLookupError = ProcessorError | { kind: 'not_found' }

export interface ProcessorPaymentState {
  objectId: string
  accountRef: string
  status: 'pending' | 'authorized' | 'captured' | 'declined' | 'canceled'
  amountCents: number
  settled: boolean
  refunds: { objectId: string; amountCents: number; status: 'succeeded' | 'pending' | 'failed' }[]
  disputes: { objectId: string; amountCents: number; status: 'open' | 'won' | 'lost' }[]
}

export interface ProcessorWebhookEvent {
  eventId: string
  type: string
  objectId: string | null
  checkoutRef: string | null
  accountRef: string | null
  livemode: boolean
}

export type WebhookVerifyError = 'bad_signature' | 'stale_timestamp' | 'malformed'

export interface PaymentProcessor {
  readonly processor: Processor
  verifyAccount(signal: AbortSignal): Promise<Result<{ accountRef: string }, ProcessorError>>
  createOnlineCheckout(
    input: {
      attemptId: string
      amountCents: number
      description: string
      returnUrl: string
      cancelUrl: string
      idempotencyKey: string
    },
    signal: AbortSignal,
  ): Promise<
    Result<{ checkoutRef: string; redirectUrl: string; objectId: string | null }, ProcessorError>
  >
  resolveCheckout(
    checkoutRef: string,
    signal: AbortSignal,
  ): Promise<Result<{ objectId: string | null }, ProcessorError>>
  startCardPresent(
    input: { attemptId: string; amountCents: number; idempotencyKey: string },
    signal: AbortSignal,
  ): Promise<Result<{ objectId: string } | { outcome: 'unknown' }, ProcessorError>>
  getPaymentState(
    objectId: string,
    signal: AbortSignal,
  ): Promise<Result<ProcessorPaymentState, ProcessorLookupError>>
  refund(
    input: { objectId: string; amountCents: number; idempotencyKey: string },
    signal: AbortSignal,
  ): Promise<Result<{ refundObjectId: string }, ProcessorError>>
  cancelAuthorization(objectId: string, signal: AbortSignal): Promise<Result<void, ProcessorError>>
  verifyWebhook(input: {
    rawBody: string
    headers: Headers
    secret: string
    now: Date
  }): Result<ProcessorWebhookEvent, WebhookVerifyError>
}

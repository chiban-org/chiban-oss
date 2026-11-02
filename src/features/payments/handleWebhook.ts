import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  type PaymentAttemptRow,
  type ProcessorAccountRow,
  paymentAttempts,
  processorEvents,
} from '@/db/schema'
import { type ActiveProcessor, getProcessorAccount } from '@/features/payments/processorAccounts'
import { createProcessor } from '@/features/payments/processors/registry'
import type { PaymentProcessor, ProcessorWebhookEvent } from '@/features/payments/processors/types'
import { reconcileAttempt } from '@/features/payments/reconcileAttempt'

type EventOutcome = (typeof processorEvents.$inferSelect)['outcome']

export interface WebhookDeps {
  now: Date
  fetch?: typeof fetch
  processorFactory?: (account: ProcessorAccountRow, credentials: unknown) => PaymentProcessor
}

export type WebhookResponse =
  | { status: 200; body: { received: true; duplicate?: true } }
  | { status: 400; body: { error: 'bad_signature' | 'malformed' } }
  | { status: 404; body: { error: 'unknown_account' } }
  | { status: 500 | 503; body: { error: 'processing_failed' | 'credentials_unreadable' } }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const RECEIVED: WebhookResponse = { status: 200, body: { received: true } }

function parseRaw(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody) as unknown
  } catch {
    return { unparsed: rawBody }
  }
}

function foreign(event: ProcessorWebhookEvent, account: ProcessorAccountRow): boolean {
  const otherAccount = event.accountRef !== null && event.accountRef !== account.accountRef
  return otherAccount || event.livemode !== (account.mode === 'live')
}

async function findAttempt(
  db: Db,
  processor: PaymentProcessor,
  account: ProcessorAccountRow,
  event: ProcessorWebhookEvent,
  signal: AbortSignal,
): Promise<PaymentAttemptRow | 'lookup_failed' | null> {
  const where = (column: 'processorObjectId' | 'checkoutRef', value: string) =>
    and(eq(paymentAttempts.processorAccountId, account.id), eq(paymentAttempts[column], value))
  if (event.objectId !== null) {
    const [byObject] = await db
      .select()
      .from(paymentAttempts)
      .where(where('processorObjectId', event.objectId))
    if (byObject !== undefined) return byObject
  }
  if (event.checkoutRef === null) return null
  const [byCheckout] = await db
    .select()
    .from(paymentAttempts)
    .where(where('checkoutRef', event.checkoutRef))
  if (byCheckout === undefined) return null
  if (byCheckout.processorObjectId !== null) return byCheckout
  if (event.objectId !== null) return { ...byCheckout, processorObjectId: event.objectId }
  const resolved = await processor.resolveCheckout(event.checkoutRef, signal)
  if (!resolved.ok) return 'lookup_failed'
  return { ...byCheckout, processorObjectId: resolved.value.objectId }
}

async function process(
  db: Db,
  deps: WebhookDeps,
  active: ActiveProcessor,
  event: ProcessorWebhookEvent,
  processor: PaymentProcessor,
  signal: AbortSignal,
): Promise<EventOutcome> {
  if (foreign(event, active.account)) return 'foreign_object'
  const attempt = await findAttempt(db, processor, active.account, event, signal)
  if (attempt === 'lookup_failed') return 'error'
  if (attempt === null || attempt.processorObjectId === null) return 'no_attempt'
  const state = await processor.getPaymentState(attempt.processorObjectId, signal)
  if (!state.ok) return 'error'
  const reconciled = await db.transaction((tx) =>
    reconcileAttempt(
      tx,
      attempt.id,
      state.value,
      { kind: 'event', eventId: event.eventId },
      signal,
      deps.now,
    ),
  )
  return reconciled.ok ? 'reconciled' : 'foreign_object'
}

export async function handleWebhook(
  db: Db,
  deps: WebhookDeps,
  request: { accountId: string; rawBody: string; headers: Headers },
  signal: AbortSignal,
): Promise<WebhookResponse> {
  signal.throwIfAborted()
  if (!UUID_PATTERN.test(request.accountId)) {
    return { status: 404, body: { error: 'unknown_account' } }
  }
  const opened = await getProcessorAccount(db, request.accountId, signal)
  if (opened.state === 'not_applicable') return { status: 404, body: { error: 'unknown_account' } }
  if (opened.state !== 'known') return { status: 503, body: { error: 'credentials_unreadable' } }
  const active = opened.value
  const processor = deps.processorFactory
    ? deps.processorFactory(active.account, active.credentials)
    : createProcessor(active.account, active.credentials, { fetch: deps.fetch ?? fetch, db })
  const verified = processor.verifyWebhook({
    rawBody: request.rawBody,
    headers: request.headers,
    secret: active.webhookSecret,
    now: deps.now,
  })
  if (!verified.ok) {
    const error = verified.error === 'malformed' ? 'malformed' : 'bad_signature'
    return { status: 400, body: { error } }
  }
  const event = verified.value
  const inserted = await db
    .insert(processorEvents)
    .values({
      processorAccountId: active.account.id,
      eventId: event.eventId,
      type: event.type,
      objectId: event.objectId,
      receivedAt: deps.now,
      raw: parseRaw(request.rawBody),
    })
    .onConflictDoNothing()
    .returning({ id: processorEvents.id })
  if (inserted.length === 0) {
    const [prior] = await db
      .select({ processedAt: processorEvents.processedAt })
      .from(processorEvents)
      .where(
        and(
          eq(processorEvents.processorAccountId, active.account.id),
          eq(processorEvents.eventId, event.eventId),
        ),
      )
    if (prior?.processedAt != null)
      return { status: 200, body: { received: true, duplicate: true } }
  }
  const outcome = await process(db, deps, active, event, processor, signal)
  await db
    .update(processorEvents)
    .set({ outcome, processedAt: outcome === 'error' ? null : deps.now })
    .where(
      and(
        eq(processorEvents.processorAccountId, active.account.id),
        eq(processorEvents.eventId, event.eventId),
      ),
    )
  return outcome === 'error' ? { status: 500, body: { error: 'processing_failed' } } : RECEIVED
}

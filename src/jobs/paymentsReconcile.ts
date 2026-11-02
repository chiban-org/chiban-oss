import { and, asc, eq, inArray, isNotNull, lt, or } from 'drizzle-orm'
import { JOB_NAMES } from '@/constants/jobNames'
import type { Tx } from '@/db/client'
import { type PaymentAttemptRow, paymentAttempts } from '@/db/schema'
import { resolveObjectId } from '@/features/payments/attemptActions'
import { openProcessor, type ProcessorFactoryDeps } from '@/features/payments/openProcessor'
import type { PaymentProcessor } from '@/features/payments/processors/types'
import { reconcileAttempt } from '@/features/payments/reconcileAttempt'
import { ok } from '@/types/result'
import { defineJob } from './defineJob'

const HOUR_SECONDS = 3600
const STALE_PENDING_MS = 10 * 60 * 1000
const HOUR_CHARS = 13
const SYSTEM_SOURCE = { kind: 'reconcile' } as const

interface ReconcilePayload {
  at?: string
}

async function dueAttempts(tx: Tx, now: Date): Promise<PaymentAttemptRow[]> {
  const staleBefore = new Date(now.getTime() - STALE_PENDING_MS)
  return await tx
    .select()
    .from(paymentAttempts)
    .where(
      and(
        or(isNotNull(paymentAttempts.processorObjectId), isNotNull(paymentAttempts.checkoutRef)),
        or(
          inArray(paymentAttempts.state, ['authorized', 'captured']),
          and(
            eq(paymentAttempts.state, 'pending'),
            or(
              eq(paymentAttempts.outcomeUnknown, true),
              lt(paymentAttempts.updatedAt, staleBefore),
            ),
          ),
        ),
      ),
    )
    .orderBy(asc(paymentAttempts.createdAt))
}

async function record(tx: Tx, attemptId: string, error: string | null, at: Date): Promise<void> {
  await tx
    .update(paymentAttempts)
    .set({ lastCheckError: error, lastCheckedAt: at })
    .where(eq(paymentAttempts.id, attemptId))
}

async function checkOne(
  tx: Tx,
  attempt: PaymentAttemptRow,
  processor: PaymentProcessor,
  now: Date,
  signal: AbortSignal,
): Promise<void> {
  const objectId = await resolveObjectId(tx, processor, attempt, signal)
  if (!objectId.ok) {
    await record(tx, attempt.id, `${objectId.error.kind}: ${objectId.error.detail}`, now)
    return
  }
  if (objectId.value === null) {
    await record(tx, attempt.id, 'checkout_unresolved', now)
    return
  }
  const state = await processor.getPaymentState(objectId.value, signal)
  if (!state.ok) {
    const error =
      state.error.kind === 'not_found' ? 'not_found' : `${state.error.kind}: ${state.error.detail}`
    await record(tx, attempt.id, error, now)
    return
  }
  const reconciled = await tx.transaction((savepoint) =>
    reconcileAttempt(savepoint, attempt.id, state.value, SYSTEM_SOURCE, signal, now),
  )
  await record(tx, attempt.id, reconciled.ok ? null : reconciled.error, now)
}

async function processorFor(
  tx: Tx,
  cache: Map<string, PaymentProcessor | string>,
  accountId: string,
  deps: ProcessorFactoryDeps,
  signal: AbortSignal,
): Promise<PaymentProcessor | string> {
  const held = cache.get(accountId)
  if (held !== undefined) return held
  const opened = await openProcessor(tx, accountId, deps, signal)
  const value = opened.ok ? opened.value.processor : `${opened.error.kind}: ${opened.error.detail}`
  cache.set(accountId, value)
  return value
}

async function checkSafely(
  tx: Tx,
  attempt: PaymentAttemptRow,
  processor: PaymentProcessor | string,
  now: Date,
  signal: AbortSignal,
): Promise<void> {
  if (typeof processor === 'string') {
    await record(tx, attempt.id, processor, now)
    return
  }
  try {
    await checkOne(tx, attempt, processor, now, signal)
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e
    await record(tx, attempt.id, `error: ${e instanceof Error ? e.message : 'failed'}`, now)
  }
}

export function makePaymentsReconcileJob(deps: ProcessorFactoryDeps) {
  return defineJob<ReconcilePayload>({
    name: JOB_NAMES.PAYMENTS_RECONCILE,
    intervalSeconds: HOUR_SECONDS,
    dedupKey: (p) =>
      `${JOB_NAMES.PAYMENTS_RECONCILE}:${(p.at ?? new Date().toISOString()).slice(0, HOUR_CHARS)}`,
    handler: async (payload, ctx) => {
      const now = payload.at === undefined ? new Date() : new Date(payload.at)
      const cache = new Map<string, PaymentProcessor | string>()
      for (const attempt of await dueAttempts(ctx.db, now)) {
        const processor = await processorFor(
          ctx.db,
          cache,
          attempt.processorAccountId,
          deps,
          ctx.signal,
        )
        await checkSafely(ctx.db, attempt, processor, now, ctx.signal)
      }
      return ok(undefined)
    },
  })
}

export const paymentsReconcileJob = makePaymentsReconcileJob({})

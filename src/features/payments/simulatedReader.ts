import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { type AttemptState, paymentAttempts, simulatedProcessorObjects } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { openProcessor, type ProcessorFactoryDeps } from '@/features/payments/openProcessor'
import type { ProcessorError } from '@/features/payments/processors/types'
import { reconcileAttempt } from '@/features/payments/reconcileAttempt'
import { err, ok, type Result } from '@/types/result'

export interface ReaderDeps extends ProcessorFactoryDeps {
  now?: Date
}

type ReaderError = 'forbidden' | 'not_found' | 'not_simulated' | ProcessorError

async function simulatedAttempt(
  db: Db,
  actor: Actor,
  attemptId: string,
  signal: AbortSignal,
): Promise<Result<typeof paymentAttempts.$inferSelect, ReaderError>> {
  const allowed = await requireCapability(db, actor.userId, 'payment.collect', signal)
  if (!allowed.ok) return err('forbidden')
  const [attempt] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.id, attemptId))
  if (attempt?.processorObjectId == null) return err('not_found')
  const opened = await openProcessor(db, attempt.processorAccountId, {}, signal)
  if (!opened.ok) return err(opened.error)
  return opened.value.account.processor === 'simulated' ? ok(attempt) : err('not_simulated')
}

export async function resolveSimulatedReader(
  db: Db,
  actor: Actor,
  input: { attemptId: string; outcome: 'captured' | 'declined' | 'unknown' },
  signal: AbortSignal,
  deps: ReaderDeps = {},
): Promise<Result<{ state: AttemptState; outcomeUnknown: boolean }, ReaderError>> {
  signal.throwIfAborted()
  const found = await simulatedAttempt(db, actor, input.attemptId, signal)
  if (!found.ok) return err(found.error)
  const attempt = found.value
  if (input.outcome === 'unknown') {
    await db
      .update(paymentAttempts)
      .set({ outcomeUnknown: true })
      .where(eq(paymentAttempts.id, attempt.id))
    return ok({ state: attempt.state, outcomeUnknown: true })
  }
  const objectId = attempt.processorObjectId ?? ''
  await db
    .update(simulatedProcessorObjects)
    .set({ status: input.outcome })
    .where(eq(simulatedProcessorObjects.id, objectId))
  const opened = await openProcessor(db, attempt.processorAccountId, deps, signal)
  if (!opened.ok) return err(opened.error)
  const state = await opened.value.processor.getPaymentState(objectId, signal)
  if (!state.ok) return err({ kind: 'rejected', detail: 'Simulated object missing' })
  const reconciled = await db.transaction((tx) =>
    reconcileAttempt(
      tx,
      attempt.id,
      state.value,
      { kind: 'reader', userId: actor.userId },
      signal,
      deps.now,
    ),
  )
  if (!reconciled.ok) return err({ kind: 'rejected', detail: 'Object belongs to another account' })
  return ok({ state: reconciled.value.state, outcomeUnknown: false })
}

export async function reconnectSimulatedReader(
  db: Db,
  actor: Actor,
  input: { attemptId: string; outcome: 'captured' | 'declined' },
  signal: AbortSignal,
): Promise<Result<void, ReaderError>> {
  signal.throwIfAborted()
  const found = await simulatedAttempt(db, actor, input.attemptId, signal)
  if (!found.ok) return err(found.error)
  await db
    .update(simulatedProcessorObjects)
    .set({ status: input.outcome })
    .where(eq(simulatedProcessorObjects.id, found.value.processorObjectId ?? ''))
  return ok(undefined)
}

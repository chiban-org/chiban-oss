import { eq } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import { type AttemptState, paymentAttempts } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { MIN_REASON_LENGTH } from '@/features/ledger/reversalSupport'
import { markVoided } from '@/features/payments/attemptTransitions'
import { openProcessor, type ProcessorFactoryDeps } from '@/features/payments/openProcessor'
import type {
  PaymentProcessor,
  ProcessorError,
  ProcessorPaymentState,
} from '@/features/payments/processors/types'
import { reconcileAttempt } from '@/features/payments/reconcileAttempt'
import { err, ok, type Result } from '@/types/result'

export interface AttemptDeps extends ProcessorFactoryDeps {
  now?: Date
}

export async function resolveObjectId(
  db: DbOrTx,
  processor: PaymentProcessor,
  attempt: typeof paymentAttempts.$inferSelect,
  signal: AbortSignal,
): Promise<Result<string | null, ProcessorError>> {
  if (attempt.processorObjectId !== null) return ok(attempt.processorObjectId)
  if (attempt.checkoutRef === null) return ok(null)
  const resolved = await processor.resolveCheckout(attempt.checkoutRef, signal)
  if (!resolved.ok) return resolved
  if (resolved.value.objectId !== null) {
    await db
      .update(paymentAttempts)
      .set({ processorObjectId: resolved.value.objectId })
      .where(eq(paymentAttempts.id, attempt.id))
  }
  return ok(resolved.value.objectId)
}

async function remoteState(
  db: Db,
  processor: PaymentProcessor,
  attempt: typeof paymentAttempts.$inferSelect,
  signal: AbortSignal,
): Promise<Result<ProcessorPaymentState | null, ProcessorError>> {
  const objectId = await resolveObjectId(db, processor, attempt, signal)
  if (!objectId.ok) return err(objectId.error)
  if (objectId.value === null) return ok(null)
  const state = await processor.getPaymentState(objectId.value, signal)
  if (state.ok) return state
  if (state.error.kind === 'not_found') return ok(null)
  return err(state.error)
}

export async function checkWithProcessor(
  db: Db,
  actor: Actor,
  attemptId: string,
  signal: AbortSignal,
  deps: AttemptDeps = {},
): Promise<
  Result<
    { state: AttemptState; outcomeUnknown: boolean },
    'forbidden' | 'not_found' | ProcessorError
  >
> {
  signal.throwIfAborted()
  const collects = await hasCapability(db, actor.userId, 'payment.collect', signal)
  const corrects = await hasCapability(db, actor.userId, 'payment.refund_void_correct', signal)
  if (!collects && !corrects) return err('forbidden')
  const [attempt] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.id, attemptId))
  if (attempt === undefined) return err('not_found')
  const opened = await openProcessor(db, attempt.processorAccountId, deps, signal)
  if (!opened.ok) return err(opened.error)
  const state = await remoteState(db, opened.value.processor, attempt, signal)
  if (!state.ok) return err(state.error)
  if (state.value === null)
    return ok({ state: attempt.state, outcomeUnknown: attempt.outcomeUnknown })
  const reconciled = await db.transaction((tx) =>
    reconcileAttempt(
      tx,
      attempt.id,
      state.value as ProcessorPaymentState,
      { kind: 'staff', userId: actor.userId },
      signal,
      deps.now,
    ),
  )
  if (!reconciled.ok)
    return err({ kind: 'rejected', detail: 'Processor object belongs to another account' })
  const [fresh] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.id, attemptId))
  return ok({ state: reconciled.value.state, outcomeUnknown: fresh?.outcomeUnknown ?? false })
}

type VoidPlan = 'void' | 'reconcile' | 'refuse' | 'cancel_authorization'

function planVoid(
  attempt: typeof paymentAttempts.$inferSelect,
  remote: ProcessorPaymentState | null,
): VoidPlan {
  if (remote?.status === 'captured') return 'reconcile'
  if (attempt.outcomeUnknown) {
    const gone = remote === null || remote.status === 'declined' || remote.status === 'canceled'
    if (!gone) return 'refuse'
  }
  return remote?.status === 'authorized' || remote?.status === 'pending'
    ? 'cancel_authorization'
    : 'void'
}

async function reconcileForVoid(
  db: Db,
  attemptId: string,
  remote: ProcessorPaymentState,
  actor: Actor,
  signal: AbortSignal,
  now: Date | undefined,
): Promise<'processor_reports_payment' | 'foreign_object'> {
  const source = { kind: 'staff', userId: actor.userId } as const
  const reconciled = await db.transaction((tx) =>
    reconcileAttempt(tx, attemptId, remote, source, signal, now),
  )
  return reconciled.ok ? 'processor_reports_payment' : reconciled.error
}

type VoidError =
  | 'forbidden'
  | 'reason_required'
  | 'not_found'
  | 'not_voidable'
  | 'outcome_unknown'
  | 'processor_reports_payment'
  | 'foreign_object'
  | ProcessorError

export async function voidAttempt(
  db: Db,
  actor: Actor,
  input: { attemptId: string; reason: string },
  signal: AbortSignal,
  deps: AttemptDeps = {},
): Promise<Result<{ state: AttemptState }, VoidError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'payment.refund_void_correct', signal))) {
    return err('forbidden')
  }
  const reason = input.reason.trim()
  if (reason.length < MIN_REASON_LENGTH) return err('reason_required')
  const [attempt] = await db
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.id, input.attemptId))
  if (attempt === undefined) return err('not_found')
  if (attempt.state !== 'pending' && attempt.state !== 'authorized') return err('not_voidable')
  const opened = await openProcessor(db, attempt.processorAccountId, deps, signal)
  if (!opened.ok) return err(opened.error)
  const state = await remoteState(db, opened.value.processor, attempt, signal)
  if (!state.ok) return err(state.error)
  const remote = state.value
  const plan = planVoid(attempt, remote)
  if (plan === 'reconcile' && remote !== null) {
    return err(await reconcileForVoid(db, attempt.id, remote, actor, signal, deps.now))
  }
  if (plan === 'refuse') return err('outcome_unknown')
  if (plan === 'cancel_authorization' && attempt.processorObjectId !== null) {
    const canceled = await opened.value.processor.cancelAuthorization(
      attempt.processorObjectId,
      signal,
    )
    if (!canceled.ok && canceled.error.kind !== 'unsupported') return err(canceled.error)
  }
  await db.transaction(async (tx) => {
    await markVoided(tx, attempt, deps.now ?? new Date())
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'payment.attempt.void',
        entityType: 'payment_attempt',
        entityId: attempt.id,
        after: { reason },
      },
      signal,
    )
  })
  return ok({ state: 'voided' })
}

import { and, eq, ne } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db, Tx } from '@/db/client'
import {
  type AttemptState,
  ledgerEntries,
  type PaymentAttemptRow,
  paymentAttempts,
  processorAccounts,
  users,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { authorizeReversal } from '@/features/ledger/reversalSupport'
import { markDeclined } from '@/features/payments/attemptTransitions'
import { type ManualOutcome, mayRecordOutcomeByHand } from '@/features/payments/manualOutcomeCheck'
import { reconcileAttempt } from '@/features/payments/reconcileAttempt'
import { err, ok, type Result } from '@/types/result'

export interface ManualOutcomeInput {
  attemptId: string
  outcome: ManualOutcome
  note: string
  processorRef?: string
  now?: Date
}

export type ManualOutcomeError =
  | 'forbidden'
  | 'note_required'
  | 'not_found'
  | 'not_pending'
  | 'too_soon'
  | 'reference_required'
  | 'reference_in_use'

async function referenceInUse(tx: Tx, attempt: PaymentAttemptRow, ref: string): Promise<boolean> {
  const [other] = await tx
    .select({ id: paymentAttempts.id })
    .from(paymentAttempts)
    .where(
      and(
        eq(paymentAttempts.processorAccountId, attempt.processorAccountId),
        eq(paymentAttempts.processorObjectId, ref),
        ne(paymentAttempts.id, attempt.id),
      ),
    )
    .limit(1)
  if (other !== undefined) return true
  const [entry] = await tx
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.processorAccountId, attempt.processorAccountId),
        eq(ledgerEntries.processorObjectId, ref),
      ),
    )
    .limit(1)
  return entry !== undefined
}

async function approvedObjectId(
  tx: Tx,
  attempt: PaymentAttemptRow,
  processorRef: string | undefined,
): Promise<Result<string, 'reference_required' | 'reference_in_use'>> {
  if (attempt.processorObjectId !== null) return ok(attempt.processorObjectId)
  const ref = processorRef?.trim() ?? ''
  if (ref === '') return err('reference_required')
  return (await referenceInUse(tx, attempt, ref)) ? err('reference_in_use') : ok(ref)
}

async function postApproval(
  tx: Tx,
  attempt: PaymentAttemptRow,
  objectId: string,
  context: { userId: string; now: Date; signal: AbortSignal },
): Promise<AttemptState> {
  const [account] = await tx
    .select({ accountRef: processorAccounts.accountRef })
    .from(processorAccounts)
    .where(eq(processorAccounts.id, attempt.processorAccountId))
  const reconciled = await reconcileAttempt(
    tx,
    attempt.id,
    {
      objectId,
      accountRef: account?.accountRef ?? '',
      status: 'captured',
      amountCents: attempt.amountCents,
      settled: false,
      refunds: [],
      disputes: [],
    },
    { kind: 'staff', userId: context.userId },
    context.signal,
    context.now,
  )
  if (!reconciled.ok) {
    throw new AppError(ErrorIds.DB_INVARIANT, 'Manual approval did not reconcile', {
      attemptId: attempt.id,
      reason: reconciled.error,
    })
  }
  return reconciled.value.state
}

async function resolve(
  tx: Tx,
  actor: Actor,
  input: ManualOutcomeInput & { note: string; now: Date },
  signal: AbortSignal,
): Promise<Result<{ state: AttemptState }, ManualOutcomeError>> {
  const [attempt] = await tx
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.id, input.attemptId))
    .for('update')
  if (attempt === undefined) return err('not_found')
  if (attempt.state !== 'pending') return err('not_pending')
  if (!mayRecordOutcomeByHand(attempt, input.now)) return err('too_soon')
  const objectId =
    input.outcome === 'approved' ? await approvedObjectId(tx, attempt, input.processorRef) : null
  if (objectId !== null && !objectId.ok) return err(objectId.error)
  const manual = {
    manualOutcome: input.outcome,
    manualNote: input.note,
    manualByUserId: actor.userId,
    manualAt: input.now,
  }
  await tx.update(paymentAttempts).set(manual).where(eq(paymentAttempts.id, attempt.id))
  let state: AttemptState = 'declined'
  if (objectId === null) {
    await markDeclined(tx, attempt, input.now)
  } else {
    state = await postApproval(tx, attempt, objectId.value, {
      userId: actor.userId,
      now: input.now,
      signal,
    })
  }
  await writeAudit(
    tx,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'payment.attempt.manual_outcome',
      entityType: 'payment_attempt',
      entityId: attempt.id,
      before: { state: attempt.state, outcomeUnknown: attempt.outcomeUnknown },
      after: { outcome: input.outcome, note: input.note, processorObjectId: objectId?.value },
    },
    signal,
  )
  return ok({ state })
}

export async function recordOutcomeByHand(
  db: Db,
  actor: Actor,
  input: ManualOutcomeInput,
  signal: AbortSignal,
): Promise<Result<{ state: AttemptState }, ManualOutcomeError>> {
  signal.throwIfAborted()
  const note = await authorizeReversal(db, actor, input.note, signal)
  if (!note.ok) return err(note.error === 'forbidden' ? 'forbidden' : 'note_required')
  const now = input.now ?? new Date()
  return await transactionResult(db, (tx) =>
    resolve(tx, actor, { ...input, note: note.value, now }, signal),
  )
}

export async function manualResolverName(
  db: Db,
  attempt: PaymentAttemptRow,
): Promise<string | null> {
  if (attempt.manualByUserId === null) return null
  const [row] = await db
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, attempt.manualByUserId))
  return row?.name ?? null
}

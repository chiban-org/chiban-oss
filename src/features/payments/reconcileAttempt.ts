import { eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Tx } from '@/db/client'
import {
  type AttemptState,
  type PaymentAttemptRow,
  type ProcessorAccountRow,
  paymentAttempts,
  paymentAttemptTransitions,
  processorAccounts,
} from '@/db/schema'
import { feeBalance } from '@/features/ledger/feeBalance'
import { lockApplications, postEntry } from '@/features/ledger/postEntry'
import { issueReceipt } from '@/features/ledger/receipts'
import type { AllocationInput } from '@/features/ledger/types'
import { isMoneyState, nextAttemptMove } from '@/features/payments/attemptStates'
import type { ProcessorPaymentState } from '@/features/payments/processors/types'
import { postProcessorReversals } from '@/features/payments/reconcileReversals'
import {
  findProcessorEntry,
  ledgerActorFor,
  noteAnomaly,
  type ReconcileSource,
} from '@/features/payments/reconcileSupport'
import { err, ok, type Result } from '@/types/result'

export interface ReconcileOutcome {
  state: AttemptState
  entriesPosted: number
}

async function advance(
  tx: Tx,
  attempt: PaymentAttemptRow,
  state: ProcessorPaymentState,
  source: ReconcileSource,
  now: Date,
): Promise<AttemptState> {
  const move = nextAttemptMove(attempt.state, state)
  const resolved = state.status !== 'pending'
  if (move.kind === 'anomaly') {
    await noteAnomaly(tx, attempt.id, move.reason)
    return attempt.state
  }
  const next = move.kind === 'move' ? move.to : attempt.state
  const changed = next !== attempt.state
  const clears = resolved && attempt.outcomeUnknown
  if (changed || clears || attempt.processorObjectId === null) {
    await tx
      .update(paymentAttempts)
      .set({
        state: next,
        outcomeUnknown: resolved ? false : attempt.outcomeUnknown,
        processorObjectId: attempt.processorObjectId ?? state.objectId,
        updatedAt: now,
        rowVersion: attempt.rowVersion + 1,
      })
      .where(eq(paymentAttempts.id, attempt.id))
  }
  if (changed) {
    await tx.insert(paymentAttemptTransitions).values({
      attemptId: attempt.id,
      fromState: attempt.state,
      toState: next,
      source: source.kind,
      eventId: source.eventId ?? null,
      at: now,
    })
  }
  return next
}

async function captureAllocations(
  tx: Tx,
  attempt: PaymentAttemptRow,
  signal: AbortSignal,
): Promise<AllocationInput[]> {
  const planned = attempt.plannedAllocations as AllocationInput[]
  const applicationIds = [
    ...new Set(planned.flatMap((p) => (p.applicationId === undefined ? [] : [p.applicationId]))),
  ]
  const due = new Map<string, { cents: number; assessmentId: string }>()
  for (const applicationId of applicationIds) {
    for (const line of (await feeBalance(tx, applicationId, signal)).lines) {
      due.set(`${applicationId}|${line.stage}|${line.feeCode}`, {
        cents: line.dueCents,
        assessmentId: line.feeAssessmentId,
      })
    }
  }
  const allocations: AllocationInput[] = []
  let excess = 0
  for (const p of planned) {
    if (p.targetKind !== 'fee_assessment_line') {
      allocations.push(p)
      continue
    }
    const line = due.get(`${p.applicationId}|${p.stage}|${p.feeCode}`)
    const take = Math.min(p.amountCents, line?.cents ?? 0)
    if (line !== undefined) line.cents -= take
    if (take > 0) allocations.push({ ...p, feeAssessmentId: line?.assessmentId, amountCents: take })
    excess += p.amountCents - take
  }
  if (excess > 0) {
    allocations.push({
      targetKind: 'overpayment',
      applicationId: planned[0]?.applicationId,
      amountCents: excess,
    })
  }
  return allocations
}

async function ensurePayment(
  tx: Tx,
  attempt: PaymentAttemptRow,
  account: ProcessorAccountRow,
  state: ProcessorPaymentState,
  source: ReconcileSource,
  signal: AbortSignal,
  now: Date,
): Promise<{ entryId: string | null; posted: number }> {
  const existing = await findProcessorEntry(tx, account.id, state.objectId, 'payment')
  if (existing !== null) return { entryId: existing, posted: 0 }
  if (state.amountCents !== attempt.amountCents) {
    await noteAnomaly(tx, attempt.id, 'amount_mismatch')
    return { entryId: null, posted: 0 }
  }
  const allocations = await captureAllocations(tx, attempt, signal)
  const receipt = await issueReceipt(
    tx,
    {
      kind: 'payment',
      payerName: attempt.payerName,
      payerEmail: attempt.payerEmail ?? undefined,
      totalCents: attempt.amountCents,
      simulated: account.processor === 'simulated',
      issuedAt: now,
    },
    signal,
  )
  const posted = await postEntry(
    tx,
    {
      entryType: 'payment',
      method: attempt.channel,
      amountCents: attempt.amountCents,
      postedAt: now,
      paymentAttemptId: attempt.id,
      processor: { name: account.processor, accountId: account.id, objectId: state.objectId },
      payerName: attempt.payerName,
      payerUserId: attempt.payerUserId ?? undefined,
      receiptId: receipt.receiptId,
      actor: ledgerActorFor(source),
      allocations,
    },
    signal,
  )
  if (!posted.ok)
    throw new AppError(ErrorIds.DB_INVARIANT, 'Capture could not be allocated', {
      attemptId: attempt.id,
      reason: posted.error,
    })
  return { entryId: posted.value.entryId, posted: 1 }
}

export async function reconcileAttempt(
  tx: Tx,
  attemptId: string,
  state: ProcessorPaymentState,
  source: ReconcileSource,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<ReconcileOutcome, 'foreign_object'>> {
  signal.throwIfAborted()
  const [attempt] = await tx
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.id, attemptId))
    .for('update')
  if (attempt === undefined) {
    throw new AppError(ErrorIds.DB_INVARIANT, 'Payment attempt not found', { attemptId })
  }
  const [account] = await tx
    .select()
    .from(processorAccounts)
    .where(eq(processorAccounts.id, attempt.processorAccountId))
  if (account === undefined) {
    throw new AppError(ErrorIds.DB_INVARIANT, 'Processor account missing', { attemptId })
  }
  const sameObject =
    attempt.processorObjectId === null || attempt.processorObjectId === state.objectId
  if (state.accountRef !== account.accountRef || !sameObject) return err('foreign_object')
  const planned = attempt.plannedAllocations as AllocationInput[]
  await lockApplications(tx, planned)
  const next = await advance(tx, attempt, state, source, now)
  if (!isMoneyState(next)) return ok({ state: next, entriesPosted: 0 })
  const payment = await ensurePayment(tx, attempt, account, state, source, signal, now)
  if (payment.entryId === null) return ok({ state: next, entriesPosted: payment.posted })
  const reversals = await postProcessorReversals(
    tx,
    { attempt, account, paymentEntryId: payment.entryId, state, source },
    signal,
    now,
  )
  return ok({ state: next, entriesPosted: payment.posted + reversals })
}

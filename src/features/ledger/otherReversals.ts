import type { Db } from '@/db/client'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { postEntry } from '@/features/ledger/postEntry'
import { allocateReversal, netAllocations } from '@/features/ledger/reversalAllocations'
import { authorizeReversal, loadEntry, type ReversalDeps } from '@/features/ledger/reversalSupport'
import type { AllocationInput } from '@/features/ledger/types'
import { findProcessorEntry } from '@/features/payments/reconcileSupport'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

type Base = 'forbidden' | 'reason_required' | 'over_reversed'

async function postReversalEntry(
  db: Db,
  actor: Actor,
  input: {
    entryType: 'returned_check' | 'chargeback' | 'correction'
    entryId: string
    amountCents: number
    reason: string
    allocations: AllocationInput[]
    processorKey?: { name: 'stripe' | 'clover' | 'simulated'; accountId: string; objectId: string }
    action: string
  },
  signal: AbortSignal,
  now: Date,
): Promise<Result<{ entryId: string }, 'over_reversed'>> {
  const original = await loadEntry(db, input.entryId)
  if (original === undefined) return err('over_reversed')
  return await transactionResult(db, async (tx) => {
    const posted = await postEntry(
      tx,
      {
        entryType: input.entryType,
        method: original.method,
        amountCents: input.amountCents,
        postedAt: now,
        reversesEntryId: original.id,
        paymentAttemptId: original.paymentAttemptId ?? undefined,
        processor: input.processorKey,
        checkNumber: original.checkNumber ?? undefined,
        payerName: original.payerName,
        payerUserId: original.payerUserId ?? undefined,
        reason: input.reason,
        actor: { kind: 'user', userId: actor.userId },
        allocations: input.allocations,
      },
      signal,
    )
    if (!posted.ok) return err('over_reversed' as const)
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: input.action,
        entityType: 'ledger_entry',
        entityId: posted.value.entryId,
        after: {
          reversesEntryId: original.id,
          amountCents: input.amountCents,
          reason: input.reason,
        },
      },
      signal,
    )
    return ok({ entryId: posted.value.entryId })
  })
}

export async function recordReturnedCheck(
  db: Db,
  actor: Actor,
  input: { entryId: string; reason: string; returnedOn: CivilDate },
  signal: AbortSignal,
  deps: ReversalDeps = {},
): Promise<Result<{ entryId: string }, Base | 'not_a_check'>> {
  signal.throwIfAborted()
  const authorized = await authorizeReversal(db, actor, input.reason, signal)
  if (!authorized.ok) return err(authorized.error)
  const entry = await loadEntry(db, input.entryId)
  if (entry?.entryType !== 'payment' || entry.method !== 'check') return err('not_a_check')
  const remaining = (await netAllocations(db, entry.id))
    .filter((n) => n.cents > 0)
    .reduce((sum, n) => sum + n.cents, 0)
  if (remaining <= 0) return err('over_reversed')
  const split = await allocateReversal(db, entry.id, remaining)
  return await postReversalEntry(
    db,
    actor,
    {
      entryType: 'returned_check',
      entryId: entry.id,
      amountCents: -remaining,
      reason: `Returned ${input.returnedOn}: ${authorized.value}`,
      allocations: split.allocations,
      action: 'payment.returned_check',
    },
    signal,
    deps.now ?? new Date(),
  )
}

export async function recordChargeback(
  db: Db,
  actor: Actor,
  input: { entryId: string; amountCents: number; disputeRef: string; reason: string },
  signal: AbortSignal,
  deps: ReversalDeps = {},
): Promise<Result<{ entryId: string }, Base | 'not_a_card_payment'>> {
  signal.throwIfAborted()
  const authorized = await authorizeReversal(db, actor, input.reason, signal)
  if (!authorized.ok) return err(authorized.error)
  const entry = await loadEntry(db, input.entryId)
  if (
    entry?.entryType !== 'payment' ||
    entry.processor === null ||
    entry.processorAccountId === null ||
    input.amountCents <= 0
  ) {
    return err('not_a_card_payment')
  }
  const known = await findProcessorEntry(
    db,
    entry.processorAccountId,
    input.disputeRef,
    'chargeback',
  )
  if (known !== null) return ok({ entryId: known })
  const split = await allocateReversal(db, entry.id, input.amountCents)
  if (split.excessCents > 0) return err('over_reversed')
  return await postReversalEntry(
    db,
    actor,
    {
      entryType: 'chargeback',
      entryId: entry.id,
      amountCents: -input.amountCents,
      reason: authorized.value,
      allocations: split.allocations,
      processorKey: {
        name: entry.processor,
        accountId: entry.processorAccountId,
        objectId: input.disputeRef,
      },
      action: 'payment.chargeback',
    },
    signal,
    deps.now ?? new Date(),
  )
}

export async function correctEntry(
  db: Db,
  actor: Actor,
  input: {
    entryId: string
    reason: string
    amountDeltaCents: number
    allocations: AllocationInput[]
  },
  signal: AbortSignal,
  deps: ReversalDeps = {},
): Promise<Result<{ entryId: string }, Base | 'amount_mismatch' | 'not_found'>> {
  signal.throwIfAborted()
  const authorized = await authorizeReversal(db, actor, input.reason, signal)
  if (!authorized.ok) return err(authorized.error)
  const entry = await loadEntry(db, input.entryId)
  if (entry === undefined) return err('not_found')
  const allocated = input.allocations.reduce((sum, a) => sum + a.amountCents, 0)
  if (input.allocations.length === 0 || allocated !== input.amountDeltaCents) {
    return err('amount_mismatch')
  }
  return await postReversalEntry(
    db,
    actor,
    {
      entryType: 'correction',
      entryId: entry.id,
      amountCents: input.amountDeltaCents,
      reason: authorized.value,
      allocations: input.allocations,
      action: 'payment.correction',
    },
    signal,
    deps.now ?? new Date(),
  )
}

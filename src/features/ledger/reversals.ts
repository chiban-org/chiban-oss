import { count, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { type LedgerEntryRow, ledgerEntries, refundRequests } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { exceedsNetPaid, postEntry } from '@/features/ledger/postEntry'
import { issueReceipt } from '@/features/ledger/receipts'
import { allocateReversal } from '@/features/ledger/reversalAllocations'
import { authorizeReversal, loadEntry, type ReversalDeps } from '@/features/ledger/reversalSupport'
import type { AllocationInput } from '@/features/ledger/types'
import { getProcessorAccount } from '@/features/payments/processorAccounts'
import { createProcessor } from '@/features/payments/processors/registry'
import type { PaymentProcessor, ProcessorError } from '@/features/payments/processors/types'
import { err, ok, type Result } from '@/types/result'

export {
  correctEntry,
  recordChargeback,
  recordReturnedCheck,
} from '@/features/ledger/otherReversals'
export type { ReversalDeps } from '@/features/ledger/reversalSupport'

export interface RefundInput {
  entryId: string
  amountCents: number
  reason: string
  allocations?: AllocationInput[]
}

export type RefundError =
  | 'forbidden'
  | 'reason_required'
  | 'over_reversed'
  | 'not_a_payment'
  | 'amount_mismatch'
  | ProcessorError

async function openProcessor(
  db: Db,
  entry: LedgerEntryRow,
  deps: ReversalDeps,
  signal: AbortSignal,
): Promise<Result<PaymentProcessor, ProcessorError>> {
  const opened = await getProcessorAccount(db, entry.processorAccountId ?? '', signal)
  if (opened.state !== 'known') {
    return err({ kind: 'rejected', detail: 'Processor credentials cannot be read' })
  }
  const { account, credentials } = opened.value
  const factory = deps.processorFactory
  return ok(
    factory ? factory(account, credentials) : createProcessor(account, credentials, { fetch, db }),
  )
}

async function plannedAllocations(
  db: Db,
  input: RefundInput,
): Promise<Result<AllocationInput[], 'over_reversed' | 'amount_mismatch'>> {
  if (input.allocations === undefined) {
    const split = await allocateReversal(db, input.entryId, input.amountCents)
    return split.excessCents > 0 ? err('over_reversed') : ok(split.allocations)
  }
  const negated = input.allocations.map((a) => ({ ...a, amountCents: -Math.abs(a.amountCents) }))
  if (negated.reduce((sum, a) => sum + a.amountCents, 0) !== -input.amountCents) {
    return err('amount_mismatch')
  }
  return (await exceedsNetPaid(db, input.entryId, negated)) ? err('over_reversed') : ok(negated)
}

async function refundKey(db: Db, entryId: string, amountCents: number): Promise<string> {
  const [prior] = await db
    .select({ n: count() })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.reversesEntryId, entryId))
  return `refund:${entryId}:${prior?.n ?? 0}:${amountCents}`
}

export async function refundEntry(
  db: Db,
  actor: Actor,
  input: RefundInput,
  signal: AbortSignal,
  deps: ReversalDeps = {},
): Promise<Result<{ entryId: string; receiptNumber: string }, RefundError>> {
  signal.throwIfAborted()
  const authorized = await authorizeReversal(db, actor, input.reason, signal)
  if (!authorized.ok) return err(authorized.error)
  const entry = await loadEntry(db, input.entryId)
  if (entry?.entryType !== 'payment' || input.amountCents <= 0) return err('not_a_payment')
  const planned = await plannedAllocations(db, input)
  if (!planned.ok) return err(planned.error)
  const now = deps.now ?? new Date()
  let refundObjectId: string | null = null
  if (entry.processor !== null) {
    const processor = await openProcessor(db, entry, deps, signal)
    if (!processor.ok) return err(processor.error)
    const refunded = await processor.value.refund(
      {
        objectId: entry.processorObjectId ?? '',
        amountCents: input.amountCents,
        idempotencyKey: await refundKey(db, entry.id, input.amountCents),
      },
      signal,
    )
    if (!refunded.ok) return err(refunded.error)
    refundObjectId = refunded.value.refundObjectId
  }
  return await transactionResult<{ entryId: string; receiptNumber: string }, RefundError>(
    db,
    async (tx) => {
      const receipt = await issueReceipt(
        tx,
        {
          kind: 'refund',
          payerName: entry.payerName,
          totalCents: input.amountCents,
          simulated: entry.processor === 'simulated',
          issuedAt: now,
        },
        signal,
      )
      const posted = await postEntry(
        tx,
        {
          entryType: 'refund',
          method: entry.method,
          amountCents: -input.amountCents,
          postedAt: now,
          reversesEntryId: entry.id,
          paymentAttemptId: entry.paymentAttemptId ?? undefined,
          processor:
            entry.processor === null || refundObjectId === null || entry.processorAccountId === null
              ? undefined
              : {
                  name: entry.processor,
                  accountId: entry.processorAccountId,
                  objectId: refundObjectId,
                },
          checkNumber: entry.checkNumber ?? undefined,
          payerName: entry.payerName,
          payerUserId: entry.payerUserId ?? undefined,
          reason: authorized.value,
          receiptId: receipt.receiptId,
          actor: { kind: 'user', userId: actor.userId },
          allocations: planned.value,
        },
        signal,
      )
      if (!posted.ok) return err('over_reversed' as const)
      if (refundObjectId !== null) {
        await tx
          .insert(refundRequests)
          .values({ refundObjectId, entryId: posted.value.entryId, allocations: planned.value })
          .onConflictDoNothing()
      }
      await writeAudit(
        tx,
        {
          actor: { kind: 'user', userId: actor.userId },
          action: 'payment.refund',
          entityType: 'ledger_entry',
          entityId: posted.value.entryId,
          after: {
            reversesEntryId: entry.id,
            amountCents: input.amountCents,
            reason: authorized.value,
          },
        },
        signal,
      )
      return ok({ entryId: posted.value.entryId, receiptNumber: receipt.number })
    },
  )
}

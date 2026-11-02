import { eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Tx } from '@/db/client'
import {
  ledgerAllocations,
  type PaymentAttemptRow,
  type ProcessorAccountRow,
  refundRequests,
} from '@/db/schema'
import { feeBalance } from '@/features/ledger/feeBalance'
import { postEntry } from '@/features/ledger/postEntry'
import { prorate } from '@/features/ledger/prorate'
import { allocateReversal, netAllocations } from '@/features/ledger/reversalAllocations'
import type { AllocationInput, LedgerEntryType } from '@/features/ledger/types'
import type { ProcessorPaymentState } from '@/features/payments/processors/types'
import {
  findProcessorEntry,
  ledgerActorFor,
  noteAnomaly,
  type ReconcileSource,
} from '@/features/payments/reconcileSupport'

export interface ReversalContext {
  attempt: PaymentAttemptRow
  account: ProcessorAccountRow
  paymentEntryId: string
  state: ProcessorPaymentState
  source: ReconcileSource
}

interface ReversalInput {
  entryType: Extract<LedgerEntryType, 'refund' | 'chargeback' | 'correction'>
  objectId: string
  amountCents: number
  reversesEntryId: string
  reason: string
  allocations: AllocationInput[]
  processorReported: boolean
}

async function postReversal(
  tx: Tx,
  ctx: ReversalContext,
  input: ReversalInput,
  signal: AbortSignal,
  now: Date,
): Promise<{ entryId: string; posted: number }> {
  const existing = await findProcessorEntry(tx, ctx.account.id, input.objectId, input.entryType)
  if (existing !== null) return { entryId: existing, posted: 0 }
  const posted = await postEntry(
    tx,
    {
      entryType: input.entryType,
      method: ctx.attempt.channel,
      amountCents: input.amountCents,
      postedAt: now,
      reversesEntryId: input.reversesEntryId,
      paymentAttemptId: ctx.attempt.id,
      processor: {
        name: ctx.account.processor,
        accountId: ctx.account.id,
        objectId: input.objectId,
      },
      payerName: ctx.attempt.payerName,
      payerUserId: ctx.attempt.payerUserId ?? undefined,
      reason: input.reason,
      processorReported: input.processorReported,
      actor: ledgerActorFor(ctx.source),
      allocations: input.allocations,
    },
    signal,
  )
  if (!posted.ok) {
    throw new AppError(ErrorIds.DB_INVARIANT, 'Processor reported reversal could not be posted', {
      objectId: input.objectId,
      reason: posted.error,
    })
  }
  return { entryId: posted.value.entryId, posted: 1 }
}

async function reversalAllocations(
  tx: Tx,
  ctx: ReversalContext,
  reversesEntryId: string,
  refundObjectId: string | null,
  amountCents: number,
): Promise<AllocationInput[]> {
  if (refundObjectId !== null) {
    const [request] = await tx
      .select()
      .from(refundRequests)
      .where(eq(refundRequests.refundObjectId, refundObjectId))
    if (request !== undefined) return request.allocations as AllocationInput[]
  }
  const split = await allocateReversal(tx, reversesEntryId, amountCents)
  if (split.excessCents > 0) await noteAnomaly(tx, ctx.attempt.id, 'reversal_exceeds_payment')
  return split.allocations
}

async function restoreAllocations(
  tx: Tx,
  paymentEntryId: string,
  chargebackEntryId: string,
  signal: AbortSignal,
): Promise<AllocationInput[]> {
  const rows = await tx
    .select()
    .from(ledgerAllocations)
    .where(eq(ledgerAllocations.entryId, chargebackEntryId))
  const negated: AllocationInput[] = rows.map((r) => ({
    targetKind: r.targetKind,
    applicationId: r.applicationId ?? undefined,
    feeAssessmentId: r.feeAssessmentId ?? undefined,
    stage: r.stage ?? undefined,
    feeCode: r.feeCode ?? undefined,
    amountCents: -r.amountCents,
  }))
  const overpaymentBack = negated
    .filter((a) => a.targetKind === 'overpayment')
    .reduce((sum, a) => sum + a.amountCents, 0)
  const heldOverpayment = (await netAllocations(tx, paymentEntryId))
    .filter((n) => n.allocation.targetKind === 'overpayment')
    .reduce((sum, n) => sum + n.cents, 0)
  const deficit = Math.max(0, -(heldOverpayment + overpaymentBack))
  const money = negated.filter((a) => a.targetKind !== 'overpayment' && a.amountCents > 0)
  const total = money.reduce((sum, a) => sum + a.amountCents, 0)
  const reduce = Math.min(deficit, total)
  const shares =
    total - reduce > 0
      ? prorate(
          total - reduce,
          money.map((a, i) => ({ key: String(i), cents: a.amountCents })),
        )
      : []
  const dues = new Map<string, number>()
  for (const applicationId of new Set(
    money.flatMap((a) => (a.applicationId === undefined ? [] : [a.applicationId])),
  )) {
    for (const line of (await feeBalance(tx, applicationId, signal)).lines) {
      dues.set(`${applicationId}|${line.stage}|${line.feeCode}`, line.dueCents)
    }
  }
  const restored: AllocationInput[] = []
  let overpayment = overpaymentBack + reduce
  for (const share of shares) {
    const source = money[Number(share.key)]
    if (source === undefined || share.cents <= 0) continue
    const lineKey = `${source.applicationId}|${source.stage}|${source.feeCode}`
    const cap = source.targetKind === 'fee_assessment_line' ? (dues.get(lineKey) ?? 0) : share.cents
    const take = Math.min(share.cents, cap)
    if (source.targetKind === 'fee_assessment_line') dues.set(lineKey, cap - take)
    overpayment += share.cents - take
    if (take > 0) restored.push({ ...source, amountCents: take })
  }
  if (overpayment > 0) {
    restored.push({
      targetKind: 'overpayment',
      applicationId: money[0]?.applicationId,
      amountCents: overpayment,
    })
  }
  return restored
}

export async function postProcessorReversals(
  tx: Tx,
  ctx: ReversalContext,
  signal: AbortSignal,
  now: Date,
): Promise<number> {
  let posted = 0
  const refunds = ctx.state.refunds.filter((r) => r.status === 'succeeded')
  for (const refund of [...refunds].sort((a, b) => a.objectId.localeCompare(b.objectId))) {
    if ((await findProcessorEntry(tx, ctx.account.id, refund.objectId, 'refund')) !== null) continue
    const allocations = await reversalAllocations(
      tx,
      ctx,
      ctx.paymentEntryId,
      refund.objectId,
      refund.amountCents,
    )
    const result = await postReversal(
      tx,
      ctx,
      {
        entryType: 'refund',
        objectId: refund.objectId,
        amountCents: -refund.amountCents,
        reversesEntryId: ctx.paymentEntryId,
        reason: 'Refund issued at the processor',
        allocations,
        processorReported: true,
      },
      signal,
      now,
    )
    posted += result.posted
  }
  for (const dispute of [...ctx.state.disputes].sort((a, b) =>
    a.objectId.localeCompare(b.objectId),
  )) {
    let chargebackId = await findProcessorEntry(tx, ctx.account.id, dispute.objectId, 'chargeback')
    if (chargebackId === null) {
      const allocations = await reversalAllocations(
        tx,
        ctx,
        ctx.paymentEntryId,
        null,
        dispute.amountCents,
      )
      const chargeback = await postReversal(
        tx,
        ctx,
        {
          entryType: 'chargeback',
          objectId: dispute.objectId,
          amountCents: -dispute.amountCents,
          reversesEntryId: ctx.paymentEntryId,
          reason: 'Dispute lost or open at the processor',
          allocations,
          processorReported: true,
        },
        signal,
        now,
      )
      chargebackId = chargeback.entryId
      posted += chargeback.posted
    }
    if (dispute.status !== 'won') continue
    const correction = await postReversal(
      tx,
      ctx,
      {
        entryType: 'correction',
        objectId: dispute.objectId,
        amountCents: dispute.amountCents,
        reversesEntryId: chargebackId,
        reason: 'Dispute won at the processor',
        allocations: await restoreAllocations(tx, ctx.paymentEntryId, chargebackId, signal),
        processorReported: true,
      },
      signal,
      now,
    )
    posted += correction.posted
  }
  return posted
}

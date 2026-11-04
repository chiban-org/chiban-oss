import { eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { type PaymentAttemptRow, paymentAttempts } from '@/db/schema'
import type { ProcessorPaymentState } from '@/features/payments/processors/types'
import { noteAnomaly } from '@/features/payments/reconcileSupport'

export const MANUAL_OUTCOME_AFTER_MS = 24 * 60 * 60 * 1000
export const MANUAL_OUTCOMES = ['approved', 'declined'] as const
export type ManualOutcome = (typeof MANUAL_OUTCOMES)[number]
export const MANUAL_OUTCOME_LABELS: Record<ManualOutcome, string> = {
  declined: 'Processor confirms declined',
  approved: 'Processor confirms approved',
}

export function mayRecordOutcomeByHand(
  attempt: Pick<PaymentAttemptRow, 'state' | 'updatedAt'>,
  now: Date,
): boolean {
  return (
    attempt.state === 'pending' &&
    now.getTime() - attempt.updatedAt.getTime() >= MANUAL_OUTCOME_AFTER_MS
  )
}

function processorVerdict(status: ProcessorPaymentState['status']): ManualOutcome | null {
  if (status === 'captured') return 'approved'
  if (status === 'declined' || status === 'canceled') return 'declined'
  return null
}

export async function heldByManualOutcome(
  tx: Tx,
  attempt: PaymentAttemptRow,
  state: ProcessorPaymentState,
): Promise<boolean> {
  if (attempt.manualOutcome === null) return false
  if (attempt.processorObjectId === null) {
    await tx
      .update(paymentAttempts)
      .set({ processorObjectId: state.objectId })
      .where(eq(paymentAttempts.id, attempt.id))
  }
  const verdict = processorVerdict(state.status)
  if (verdict === attempt.manualOutcome) return verdict === 'declined'
  if (verdict !== null && attempt.processorMismatch === null)
    await recordMismatch(tx, attempt, state)
  return true
}

async function recordMismatch(
  tx: Tx,
  attempt: PaymentAttemptRow,
  state: ProcessorPaymentState,
): Promise<void> {
  await tx
    .update(paymentAttempts)
    .set({ processorMismatch: state.status })
    .where(eq(paymentAttempts.id, attempt.id))
  await noteAnomaly(tx, attempt.id, 'processor_disagrees_with_manual_outcome')
}

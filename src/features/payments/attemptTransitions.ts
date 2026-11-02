import { eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { type PaymentAttemptRow, paymentAttempts, paymentAttemptTransitions } from '@/db/schema'

export async function markVoided(
  tx: Tx,
  attempt: PaymentAttemptRow,
  now: Date,
  anomaly: string | null = null,
): Promise<void> {
  await tx
    .update(paymentAttempts)
    .set({
      state: 'voided',
      outcomeUnknown: false,
      anomaly: anomaly ?? attempt.anomaly,
      updatedAt: now,
      rowVersion: attempt.rowVersion + 1,
    })
    .where(eq(paymentAttempts.id, attempt.id))
  await tx.insert(paymentAttemptTransitions).values({
    attemptId: attempt.id,
    fromState: attempt.state,
    toState: 'voided',
    source: 'staff',
    at: now,
  })
}

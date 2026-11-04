import { eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { type PaymentAttemptRow, paymentAttempts, paymentAttemptTransitions } from '@/db/schema'

async function closeByStaff(
  tx: Tx,
  attempt: PaymentAttemptRow,
  change: { to: 'voided' | 'declined'; anomaly: string | null },
  now: Date,
): Promise<void> {
  const { to, anomaly } = change
  await tx
    .update(paymentAttempts)
    .set({
      state: to,
      outcomeUnknown: false,
      anomaly: anomaly ?? attempt.anomaly,
      updatedAt: now,
      rowVersion: attempt.rowVersion + 1,
    })
    .where(eq(paymentAttempts.id, attempt.id))
  await tx.insert(paymentAttemptTransitions).values({
    attemptId: attempt.id,
    fromState: attempt.state,
    toState: to,
    source: 'staff',
    at: now,
  })
}

export async function markVoided(
  tx: Tx,
  attempt: PaymentAttemptRow,
  now: Date,
  anomaly: string | null = null,
): Promise<void> {
  await closeByStaff(tx, attempt, { to: 'voided', anomaly }, now)
}

export async function markDeclined(tx: Tx, attempt: PaymentAttemptRow, now: Date): Promise<void> {
  await closeByStaff(tx, attempt, { to: 'declined', anomaly: null }, now)
}

import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { paymentAttempts } from '@/db/schema'

export type PaymentReturnStatus = 'received' | 'processing' | 'declined' | 'not_found'

export async function paymentReturnStatus(
  db: DbOrTx,
  attemptId: string,
  signal: AbortSignal,
): Promise<PaymentReturnStatus> {
  signal.throwIfAborted()
  const [attempt] = await db
    .select({ state: paymentAttempts.state })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.id, attemptId))
  if (attempt === undefined) return 'not_found'
  if (attempt.state === 'captured' || attempt.state === 'settled') return 'received'
  if (attempt.state === 'pending' || attempt.state === 'authorized') return 'processing'
  return 'declined'
}

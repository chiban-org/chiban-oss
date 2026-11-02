import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import {
  type CounterPaymentError,
  type CounterPaymentResult,
  recordCounterPayment,
} from '@/features/counter/counterPayment'
import { allocateToDueLines, feeBalance } from '@/features/ledger/feeBalance'
import { err, type Result } from '@/types/result'

export interface ApplicationPaymentInput {
  applicationId: string
  method: 'cash' | 'check'
  amountCents: number
  tenderedCents?: number
  checkNumber?: string
  payerName: string
}

export async function recordApplicationPayment(
  db: Db,
  actor: Actor,
  input: ApplicationPaymentInput,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<CounterPaymentResult, CounterPaymentError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'payment.collect', signal)
  if (!allowed.ok) return err('forbidden')
  const balance = await feeBalance(db, input.applicationId, signal)
  if (input.amountCents > balance.dueCents) return err('over_allocated')
  const { applicationId: _applicationId, ...payment } = input
  return await recordCounterPayment(
    db,
    actor,
    {
      ...payment,
      allocations: allocateToDueLines(input.applicationId, balance, input.amountCents),
    },
    signal,
    now,
  )
}

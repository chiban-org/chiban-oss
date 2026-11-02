import type { DbOrTx } from '@/db/client'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { postEntry } from '@/features/ledger/postEntry'
import { issueReceipt } from '@/features/ledger/receipts'
import type { AllocationInput } from '@/features/ledger/types'
import { err, ok, type Result } from '@/types/result'

export interface CounterPaymentInput {
  method: 'cash' | 'check'
  amountCents: number
  tenderedCents?: number
  checkNumber?: string
  payerName: string
  payerEmail?: string
  allocations: AllocationInput[]
}

export type CounterPaymentError =
  | 'forbidden'
  | 'over_allocated'
  | 'tendered_short'
  | 'check_number_required'
  | 'amount_mismatch'

export interface CounterPaymentResult {
  entryId: string
  receiptNumber: string
  changeCents: number
}

function validate(input: CounterPaymentInput): CounterPaymentError | null {
  const allocated = input.allocations.reduce((sum, a) => sum + a.amountCents, 0)
  if (input.amountCents <= 0 || allocated !== input.amountCents) return 'amount_mismatch'
  if (input.method === 'check' && (input.checkNumber ?? '').trim() === '') {
    return 'check_number_required'
  }
  if (input.method === 'cash' && (input.tenderedCents ?? input.amountCents) < input.amountCents) {
    return 'tendered_short'
  }
  return null
}

export async function recordCounterPayment(
  db: DbOrTx,
  actor: Actor,
  input: CounterPaymentInput,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<CounterPaymentResult, CounterPaymentError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'payment.collect', signal)
  if (!allowed.ok) return err('forbidden')
  const invalid = validate(input)
  if (invalid !== null) return err(invalid)
  const tendered = input.method === 'cash' ? (input.tenderedCents ?? input.amountCents) : undefined
  return await transactionResult(db, async (tx) => {
    const receipt = await issueReceipt(
      tx,
      {
        kind: 'payment',
        payerName: input.payerName,
        payerEmail: input.payerEmail,
        totalCents: input.amountCents,
        tenderedCents: tendered,
        issuedAt: now,
      },
      signal,
    )
    const posted = await postEntry(
      tx,
      {
        entryType: 'payment',
        method: input.method,
        amountCents: input.amountCents,
        postedAt: now,
        checkNumber: input.method === 'check' ? input.checkNumber?.trim() : undefined,
        payerName: input.payerName,
        receiptId: receipt.receiptId,
        actor: { kind: 'user', userId: actor.userId },
        allocations: input.allocations,
      },
      signal,
    )
    if (!posted.ok) return err('over_allocated' as const)
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'payment.counter',
        entityType: 'ledger_entry',
        entityId: posted.value.entryId,
        after: {
          method: input.method,
          amountCents: input.amountCents,
          receiptNumber: receipt.number,
        },
      },
      signal,
    )
    return ok({
      entryId: posted.value.entryId,
      receiptNumber: receipt.number,
      changeCents: tendered === undefined ? 0 : tendered - input.amountCents,
    })
  })
}

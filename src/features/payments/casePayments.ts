import { desc, eq, inArray } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { ledgerAllocations, ledgerEntries, receipts } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { netAllocations } from '@/features/ledger/reversalAllocations'
import { mayViewPayments } from '@/features/payments/overview'

export interface CasePaymentEntry {
  id: string
  entryType: string
  method: string
  amountCents: number
  payerName: string
  businessDate: string
  checkNumber: string | null
  receiptId: string | null
  receiptNumber: string | null
  paymentAttemptId: string | null
  refundableCents: number
}

export interface CasePayments {
  canRefund: boolean
  byFine: ReadonlyMap<string, CasePaymentEntry[]>
}

async function refundableOnFine(db: Db, entryId: string, fineId: string): Promise<number> {
  return (await netAllocations(db, entryId))
    .filter((n) => n.allocation.fineId === fineId && n.cents > 0)
    .reduce((sum, n) => sum + n.cents, 0)
}

export async function loadCasePayments(
  db: Db,
  actor: Actor,
  fineIds: readonly string[],
  signal: AbortSignal,
): Promise<CasePayments | null> {
  signal.throwIfAborted()
  if (!(await mayViewPayments(db, actor, signal))) return null
  const canRefund = await hasCapability(db, actor.userId, 'payment.refund_void_correct', signal)
  if (fineIds.length === 0) return { canRefund, byFine: new Map() }
  const rows = await db
    .selectDistinct({
      fineId: ledgerAllocations.fineId,
      id: ledgerEntries.id,
      entryType: ledgerEntries.entryType,
      method: ledgerEntries.method,
      amountCents: ledgerEntries.amountCents,
      payerName: ledgerEntries.payerName,
      businessDate: ledgerEntries.businessDate,
      checkNumber: ledgerEntries.checkNumber,
      postedAt: ledgerEntries.postedAt,
      receiptId: ledgerEntries.receiptId,
      receiptNumber: receipts.number,
      paymentAttemptId: ledgerEntries.paymentAttemptId,
    })
    .from(ledgerEntries)
    .innerJoin(ledgerAllocations, eq(ledgerAllocations.entryId, ledgerEntries.id))
    .leftJoin(receipts, eq(receipts.id, ledgerEntries.receiptId))
    .where(inArray(ledgerAllocations.fineId, [...fineIds]))
    .orderBy(desc(ledgerEntries.postedAt))
  const byFine = new Map<string, CasePaymentEntry[]>()
  for (const { fineId, postedAt: _postedAt, ...entry } of rows) {
    if (fineId === null) continue
    const refundableCents =
      canRefund && entry.entryType === 'payment' ? await refundableOnFine(db, entry.id, fineId) : 0
    byFine.set(fineId, [...(byFine.get(fineId) ?? []), { ...entry, refundableCents }])
  }
  return { canRefund, byFine }
}

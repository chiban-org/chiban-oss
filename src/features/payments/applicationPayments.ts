import { desc, eq, ne, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications, ledgerAllocations, ledgerEntries, receipts } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { type FeeBalance, feeBalance } from '@/features/ledger/feeBalance'
import { mayViewPayments } from '@/features/payments/overview'

const TARGET_LIMIT = 25

export interface ApplicationPayments {
  balance: FeeBalance
  entries: {
    id: string
    entryType: string
    method: string
    amountCents: number
    payerName: string
    businessDate: string
    checkNumber: string | null
    receiptId: string | null
    receiptNumber: string | null
  }[]
  canRefund: boolean
  targets: { id: string; number: string }[]
}

export async function loadApplicationPayments(
  db: Db,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<ApplicationPayments | null> {
  signal.throwIfAborted()
  if (!(await mayViewPayments(db, actor, signal))) return null
  const entries = await db
    .selectDistinct({
      id: ledgerEntries.id,
      entryType: ledgerEntries.entryType,
      method: ledgerEntries.method,
      amountCents: ledgerEntries.amountCents,
      payerName: ledgerEntries.payerName,
      businessDate: ledgerEntries.businessDate,
      postedAt: ledgerEntries.postedAt,
      checkNumber: ledgerEntries.checkNumber,
      receiptId: ledgerEntries.receiptId,
      receiptNumber: receipts.number,
    })
    .from(ledgerEntries)
    .innerJoin(ledgerAllocations, eq(ledgerAllocations.entryId, ledgerEntries.id))
    .leftJoin(receipts, eq(receipts.id, ledgerEntries.receiptId))
    .where(eq(ledgerAllocations.applicationId, applicationId))
    .orderBy(desc(ledgerEntries.postedAt))
  const canRefund = await hasCapability(db, actor.userId, 'payment.refund_void_correct', signal)
  const targets = canRefund
    ? await db
        .select({ id: applications.id, number: applications.number })
        .from(applications)
        .where(ne(applications.id, applicationId))
        .orderBy(desc(applications.createdAt), sql`${applications.number}`)
        .limit(TARGET_LIMIT)
    : []
  return {
    balance: await feeBalance(db, applicationId, signal),
    entries: entries.map(({ postedAt: _postedAt, ...rest }) => rest),
    canRefund,
    targets,
  }
}

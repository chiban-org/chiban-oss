import { and, eq, inArray } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import { applications, ledgerEntries, paymentAttempts, processorAccounts } from '@/db/schema'
import { buildReceiptPdf } from '@/features/ledger/receiptPdf'
import { NOT_FOUND, type PdfResponseData, pdfOk } from '@/features/pdf/pdfResponse'
import { isUuid } from '@/utils/uuid'

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

export interface PaymentReturnDetails {
  status: PaymentReturnStatus
  simulated: boolean
  amountCents: number | null
  applicationNumbers: string[]
  receiptId: string | null
}

const EMPTY: PaymentReturnDetails = {
  status: 'not_found',
  simulated: false,
  amountCents: null,
  applicationNumbers: [],
  receiptId: null,
}

async function receiptOf(db: DbOrTx, attemptId: string): Promise<string | null> {
  const [entry] = await db
    .select({ receiptId: ledgerEntries.receiptId })
    .from(ledgerEntries)
    .where(
      and(eq(ledgerEntries.paymentAttemptId, attemptId), eq(ledgerEntries.entryType, 'payment')),
    )
  return entry?.receiptId ?? null
}

export async function paymentReturnDetails(
  db: DbOrTx,
  attemptId: string,
  signal: AbortSignal,
): Promise<PaymentReturnDetails> {
  signal.throwIfAborted()
  const status = await paymentReturnStatus(db, attemptId, signal)
  if (status === 'not_found') return EMPTY
  const [attempt] = await db
    .select({
      amountCents: paymentAttempts.amountCents,
      planned: paymentAttempts.plannedAllocations,
      processor: processorAccounts.processor,
    })
    .from(paymentAttempts)
    .innerJoin(processorAccounts, eq(processorAccounts.id, paymentAttempts.processorAccountId))
    .where(eq(paymentAttempts.id, attemptId))
  if (attempt === undefined) return EMPTY
  const applicationIds = [
    ...new Set(
      (attempt.planned as { applicationId: string }[]).map(
        (allocation) => allocation.applicationId,
      ),
    ),
  ]
  const numbers =
    applicationIds.length === 0
      ? []
      : await db
          .select({ number: applications.number })
          .from(applications)
          .where(inArray(applications.id, applicationIds))
          .orderBy(applications.number)
  return {
    status,
    simulated: attempt.processor === 'simulated',
    amountCents: attempt.amountCents,
    applicationNumbers: numbers.map((n) => n.number),
    receiptId: status === 'received' ? await receiptOf(db, attemptId) : null,
  }
}

export async function attemptReceiptPdfResponse(
  db: Db,
  attemptId: string,
  signal: AbortSignal,
): Promise<PdfResponseData> {
  if (!isUuid(attemptId)) return NOT_FOUND
  const details = await paymentReturnDetails(db, attemptId, signal)
  if (details.receiptId === null) return NOT_FOUND
  const built = await buildReceiptPdf(db, details.receiptId, signal)
  return built.ok ? pdfOk(built.value) : NOT_FOUND
}

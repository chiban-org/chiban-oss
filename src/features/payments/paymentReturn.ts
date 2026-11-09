import { and, eq, inArray, or, type SQL, sql } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import {
  applications,
  ledgerEntries,
  paymentAttempts,
  processorAccounts,
  receipts,
} from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { buildReceiptPdf, type ReceiptLine, receiptLines } from '@/features/ledger/receiptPdf'
import { seesWholeLedger } from '@/features/ledger/visibility'
import { NOT_FOUND, type PdfResponseData, pdfOk } from '@/features/pdf/pdfResponse'
import { hasFullRecordAccess } from '@/features/projects/access'
import { isUuid } from '@/utils/uuid'

export type PaymentReturnStatus = 'received' | 'processing' | 'declined' | 'not_found'

export function attemptVisibleTo(actor: Actor | null): SQL {
  if (actor === null) return sql`false`
  if (hasFullRecordAccess(actor) && seesWholeLedger(actor)) return sql`true`
  return (
    or(
      eq(paymentAttempts.payerUserId, actor.userId),
      eq(paymentAttempts.createdByUserId, actor.userId),
    ) ?? sql`false`
  )
}

export async function paymentReturnStatus(
  db: DbOrTx,
  actor: Actor | null,
  attemptId: string,
  signal: AbortSignal,
): Promise<PaymentReturnStatus> {
  signal.throwIfAborted()
  const [attempt] = await db
    .select({ state: paymentAttempts.state })
    .from(paymentAttempts)
    .where(and(eq(paymentAttempts.id, attemptId), attemptVisibleTo(actor)))
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
  applications: { id: string; number: string }[]
  receiptId: string | null
  receiptNumber: string | null
  lines: ReceiptLine[]
}

const EMPTY: PaymentReturnDetails = {
  status: 'not_found',
  simulated: false,
  amountCents: null,
  applicationNumbers: [],
  applications: [],
  receiptId: null,
  receiptNumber: null,
  lines: [],
}

const NO_RECEIPT = { receiptId: null, receiptNumber: null, lines: [] }

async function receiptOf(
  db: DbOrTx,
  attemptId: string,
): Promise<Pick<PaymentReturnDetails, 'receiptId' | 'receiptNumber' | 'lines'>> {
  const [entry] = await db
    .select({ entryId: ledgerEntries.id, receiptId: receipts.id, number: receipts.number })
    .from(ledgerEntries)
    .innerJoin(receipts, eq(receipts.id, ledgerEntries.receiptId))
    .where(
      and(eq(ledgerEntries.paymentAttemptId, attemptId), eq(ledgerEntries.entryType, 'payment')),
    )
  if (entry === undefined) return NO_RECEIPT
  return {
    receiptId: entry.receiptId,
    receiptNumber: entry.number,
    lines: await receiptLines(db, entry.entryId),
  }
}

export async function paymentReturnDetails(
  db: DbOrTx,
  actor: Actor | null,
  attemptId: string,
  signal: AbortSignal,
): Promise<PaymentReturnDetails> {
  signal.throwIfAborted()
  const status = await paymentReturnStatus(db, actor, attemptId, signal)
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
          .select({ id: applications.id, number: applications.number })
          .from(applications)
          .where(inArray(applications.id, applicationIds))
          .orderBy(applications.number)
  return {
    status,
    simulated: attempt.processor === 'simulated',
    amountCents: attempt.amountCents,
    applicationNumbers: numbers.map((n) => n.number),
    applications: numbers,
    ...(status === 'received' ? await receiptOf(db, attemptId) : NO_RECEIPT),
  }
}

export async function attemptReceiptPdfResponse(
  db: Db,
  actor: Actor | null,
  attemptId: string,
  signal: AbortSignal,
): Promise<PdfResponseData> {
  if (!isUuid(attemptId)) return NOT_FOUND
  const details = await paymentReturnDetails(db, actor, attemptId, signal)
  if (details.receiptId === null) return NOT_FOUND
  const built = await buildReceiptPdf(db, details.receiptId, signal)
  return built.ok ? pdfOk(built.value) : NOT_FOUND
}

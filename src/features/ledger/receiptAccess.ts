import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { ledgerEntries } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { buildReceiptPdf } from '@/features/ledger/receiptPdf'
import { ledgerEntryVisibleTo } from '@/features/ledger/visibility'
import { FORBIDDEN, NOT_FOUND, type PdfResponseData, pdfOk } from '@/features/pdf/pdfResponse'
import { hasFullRecordAccess } from '@/features/projects/access'
import { isUuid } from '@/utils/uuid'

export async function receiptPdfResponse(
  db: Db,
  actor: Actor | null,
  receiptId: string,
  signal: AbortSignal,
): Promise<PdfResponseData> {
  if (actor === null || !hasFullRecordAccess(actor)) return FORBIDDEN
  if (!isUuid(receiptId)) return NOT_FOUND
  const visible = await db
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.receiptId, receiptId), ledgerEntryVisibleTo(actor)))
    .limit(1)
  if (visible.length === 0) return FORBIDDEN
  const built = await buildReceiptPdf(db, receiptId, signal)
  return built.ok ? pdfOk(built.value) : NOT_FOUND
}

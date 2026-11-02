import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { buildReceiptPdf } from '@/features/ledger/receiptPdf'
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
  const built = await buildReceiptPdf(db, receiptId, signal)
  return built.ok ? pdfOk(built.value) : NOT_FOUND
}

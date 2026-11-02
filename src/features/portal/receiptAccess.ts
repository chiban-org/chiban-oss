import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { ledgerAllocations, ledgerEntries } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { buildReceiptPdf } from '@/features/ledger/receiptPdf'
import { ledgerEntryVisibleTo } from '@/features/ledger/visibility'
import { NOT_FOUND, type PdfResponseData, pdfOk } from '@/features/pdf/pdfResponse'
import { isUuid } from '@/utils/uuid'

export async function portalReceiptPdfResponse(
  db: Db,
  actor: Actor,
  input: { applicationId: string; receiptId: string },
  signal: AbortSignal,
): Promise<PdfResponseData> {
  signal.throwIfAborted()
  if (!isUuid(input.applicationId) || !isUuid(input.receiptId)) return NOT_FOUND
  const visible = await db
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .innerJoin(ledgerAllocations, eq(ledgerAllocations.entryId, ledgerEntries.id))
    .where(
      and(
        eq(ledgerEntries.receiptId, input.receiptId),
        eq(ledgerAllocations.applicationId, input.applicationId),
        ledgerEntryVisibleTo(actor),
      ),
    )
    .limit(1)
  if (visible.length === 0) return NOT_FOUND
  const built = await buildReceiptPdf(db, input.receiptId, signal, {
    applicationId: input.applicationId,
  })
  return built.ok ? pdfOk(built.value) : NOT_FOUND
}

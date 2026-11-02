import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { FORBIDDEN, NOT_FOUND, type PdfResponseData, pdfOk } from '@/features/pdf/pdfResponse'
import { buildPermitPdf, buildPlacardPdf } from '@/features/permits/permitDocuments'
import { hasFullRecordAccess } from '@/features/projects/access'
import { isUuid } from '@/utils/uuid'

export async function permitPdfResponse(
  db: Db,
  actor: Actor | null,
  input: { applicationId: string; document: 'permit' | 'placard' },
  signal: AbortSignal,
): Promise<PdfResponseData> {
  if (actor === null || !hasFullRecordAccess(actor)) return FORBIDDEN
  if (!isUuid(input.applicationId)) return NOT_FOUND
  const build = input.document === 'permit' ? buildPermitPdf : buildPlacardPdf
  const built = await build(db, input.applicationId, signal)
  return built.ok ? pdfOk(built.value) : NOT_FOUND
}

import { db } from '@/db/client'
import { NOT_FOUND, toResponse } from '@/features/pdf/pdfResponse'
import { portalReceiptPdfResponse } from '@/features/portal/receiptAccess'
import { portalActorOrNull } from '@/server/requirePortal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REQUEST_TIMEOUT_MS = 30_000

export async function GET(
  request: Request,
  { params }: { params: Promise<{ applicationId: string; receiptId: string }> },
): Promise<Response> {
  const { applicationId, receiptId } = await params
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const actor = await portalActorOrNull(signal)
  const data =
    actor === null
      ? NOT_FOUND
      : await portalReceiptPdfResponse(db, actor, { applicationId, receiptId }, signal)
  return toResponse(data, request.headers.get('accept'))
}

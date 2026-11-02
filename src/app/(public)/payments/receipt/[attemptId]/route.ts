import { db } from '@/db/client'
import { attemptReceiptPdfResponse } from '@/features/payments/paymentReturn'
import { toResponse } from '@/features/pdf/pdfResponse'
import { portalActorOrNull } from '@/server/requirePortal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REQUEST_TIMEOUT_MS = 30_000

export async function GET(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
): Promise<Response> {
  const { attemptId } = await params
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const actor = await portalActorOrNull(signal)
  return toResponse(
    await attemptReceiptPdfResponse(db, actor, attemptId, signal),
    request.headers.get('accept'),
  )
}

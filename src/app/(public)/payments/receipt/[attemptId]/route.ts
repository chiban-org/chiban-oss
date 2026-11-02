import { db } from '@/db/client'
import { attemptReceiptPdfResponse } from '@/features/payments/paymentReturn'
import { toResponse } from '@/features/pdf/pdfResponse'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REQUEST_TIMEOUT_MS = 30_000

export async function GET(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
): Promise<Response> {
  const { attemptId } = await params
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  return toResponse(
    await attemptReceiptPdfResponse(db, attemptId, signal),
    request.headers.get('accept'),
  )
}

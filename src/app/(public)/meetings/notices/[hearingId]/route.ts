import { db } from '@/db/client'
import { renderPublicNoticePdf } from '@/features/hearings/publicNotices'
import { NOT_FOUND, pdfOk, toResponse } from '@/features/pdf/pdfResponse'
import { townToday } from '@/features/town/today'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 30_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  request: Request,
  { params }: { params: Promise<{ hearingId: string }> },
): Promise<Response> {
  const { hearingId } = await params
  const accept = request.headers.get('accept')
  if (!UUID.test(hearingId)) return toResponse(NOT_FOUND, accept)
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const today = await townToday(db, new Date(), signal)
  const pdf = await renderPublicNoticePdf(db, hearingId, today, signal)
  return toResponse(pdf === null ? NOT_FOUND : pdfOk(pdf), accept)
}

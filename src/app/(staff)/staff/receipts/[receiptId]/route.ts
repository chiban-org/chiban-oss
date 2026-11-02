import { db } from '@/db/client'
import { receiptPdfResponse } from '@/features/ledger/receiptAccess'
import { toResponse } from '@/features/pdf/pdfResponse'
import { getActor } from '@/server/getActor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REQUEST_TIMEOUT_MS = 30_000

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ receiptId: string }> },
): Promise<Response> {
  const { receiptId } = await params
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const actor = await getActor(signal)
  return toResponse(await receiptPdfResponse(db, actor, receiptId, signal))
}

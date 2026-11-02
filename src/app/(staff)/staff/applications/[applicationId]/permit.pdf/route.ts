import { db } from '@/db/client'
import { toResponse } from '@/features/pdf/pdfResponse'
import { permitPdfResponse } from '@/features/permits/permitAccess'
import { getActor } from '@/server/getActor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REQUEST_TIMEOUT_MS = 30_000

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ applicationId: string }> },
): Promise<Response> {
  const { applicationId } = await params
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const actor = await getActor(signal)
  return toResponse(
    await permitPdfResponse(db, actor, { applicationId, document: 'permit' }, signal),
  )
}

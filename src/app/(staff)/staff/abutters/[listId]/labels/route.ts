import { db } from '@/db/client'
import { labelsPdfResponse } from '@/features/abutters/labels/labelsAccess'
import { toResponse } from '@/features/pdf/pdfResponse'
import { staffActorOrNull } from '@/server/requireStaff'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REQUEST_TIMEOUT_MS = 30_000

export async function GET(
  request: Request,
  { params }: { params: Promise<{ listId: string }> },
): Promise<Response> {
  const { listId } = await params
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const actor = await staffActorOrNull(signal)
  const sheet = new URL(request.url).searchParams.get('sheet')
  return toResponse(
    await labelsPdfResponse(db, actor, listId, sheet, signal),
    request.headers.get('accept'),
  )
}

import { db } from '@/db/client'
import { downloadLink } from '@/features/export/requestExport'
import { FORBIDDEN, NOT_FOUND, toResponse } from '@/features/pdf/pdfResponse'
import { getObjectStore } from '@/features/storage/objectStore'
import { currentServiceState } from '@/features/town/serviceStatus'
import { staffActorOrNull } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REQUEST_TIMEOUT_MS = 30_000

export async function GET(
  request: Request,
  context: { params: Promise<{ exportId: string }> },
): Promise<Response> {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const actor = await staffActorOrNull(signal)
  const accept = request.headers.get('accept')
  if (actor === null) return toResponse(FORBIDDEN, accept)
  const { exportId } = await context.params
  if (!isUuid(exportId)) return toResponse(NOT_FOUND, accept)
  const state = await currentServiceState(db, new Date(), signal)
  if (state.mode === 'closed') return toResponse(FORBIDDEN, accept)
  const link = await downloadLink(db, getObjectStore(), actor, exportId, signal)
  if (!link.ok) return toResponse(link.error === 'forbidden' ? FORBIDDEN : NOT_FOUND, accept)
  return new Response(null, {
    status: 302,
    headers: { location: link.value.url, 'cache-control': 'private, no-store' },
  })
}

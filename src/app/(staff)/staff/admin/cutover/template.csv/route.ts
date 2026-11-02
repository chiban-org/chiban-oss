import { db } from '@/db/client'
import { hasCapability } from '@/features/authz/capabilities'
import { cutoverTemplate } from '@/features/cutover/template'
import { FORBIDDEN, toResponse } from '@/features/pdf/pdfResponse'
import { staffActorOrNull } from '@/server/requireStaff'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REQUEST_TIMEOUT_MS = 30_000

export async function GET(request: Request): Promise<Response> {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const actor = await staffActorOrNull(signal)
  const accept = request.headers.get('accept')
  if (actor === null || !(await hasCapability(db, actor.userId, 'cutover.import', signal))) {
    return toResponse(FORBIDDEN, accept)
  }
  const type = new URL(request.url).searchParams.get('type') ?? ''
  const header = await cutoverTemplate(db, type, signal)
  return new Response(`${header}\r\n`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="cutover-template${type === '' ? '' : `-${type}`}.csv"`,
      'cache-control': 'private, no-store',
    },
  })
}

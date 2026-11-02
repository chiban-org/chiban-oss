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
  const template = await cutoverTemplate(db, type, signal)
  if (!template.ok) {
    return new Response(
      `No adopted application type has the key ${type}. Pick a type on the cutover page.\r\n`,
      { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    )
  }
  const { header, typeKey } = template.value
  return new Response(`${header}\r\n`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="cutover-template${typeKey === null ? '' : `-${typeKey}`}.csv"`,
      'cache-control': 'private, no-store',
    },
  })
}

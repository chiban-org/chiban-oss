import { db } from '@/db/client'
import { hasCapability } from '@/features/authz/capabilities'
import { renderEditorPage } from '@/features/redaction/previewPages'
import { getObjectStore } from '@/features/storage/objectStore'
import { staffActorOrNull } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 60_000

function notFound(): Response {
  return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ versionId: string; page: string }> },
): Promise<Response> {
  const { versionId, page } = await params
  const pageNumber = Number(page)
  if (!isUuid(versionId) || !Number.isInteger(pageNumber)) return notFound()
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const actor = await staffActorOrNull(signal)
  if (actor === null) return notFound()
  if (!(await hasCapability(db, actor.userId, 'redaction.create', signal))) return notFound()
  const rendered = await renderEditorPage(db, getObjectStore(), versionId, pageNumber, signal)
  if (!rendered.ok) return notFound()
  return new Response(Buffer.from(rendered.value), {
    status: 200,
    headers: { 'content-type': 'image/png', 'cache-control': 'no-store' },
  })
}

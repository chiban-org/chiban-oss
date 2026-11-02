import { db } from '@/db/client'
import { downloadDocument } from '@/features/documents/download'
import { getObjectStore } from '@/features/storage/objectStore'
import { getActor } from '@/server/getActor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REQUEST_TIMEOUT_MS = 30_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const NO_STORE = { 'cache-control': 'no-store' }

function notFound(): Response {
  return new Response('Not found', { status: 404, headers: NO_STORE })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
): Promise<Response> {
  const { documentId } = await params
  if (!UUID.test(documentId)) return notFound()
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const actor = await getActor(signal)
  const rendition =
    new URL(request.url).searchParams.get('rendition') === 'pdfa' ? 'pdfa' : 'default'
  const result = await downloadDocument(db, getObjectStore(), actor, documentId, rendition, signal)
  if (!result.ok) return notFound()
  return new Response(null, {
    status: 302,
    headers: { location: result.value.url, ...NO_STORE },
  })
}

import { db } from '@/db/client'
import type { RenditionKind } from '@/db/schema'
import { serveDerivative } from '@/features/renditions/derive'
import { getObjectStore } from '@/features/storage/objectStore'
import { getActor } from '@/server/getActor'

const REQUEST_TIMEOUT_MS = 60_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_STORE = { 'cache-control': 'no-store' }

export function notFound(): Response {
  return new Response('Not found', { status: 404, headers: NO_STORE })
}

export async function derivativeResponse(
  documentId: string,
  kind: RenditionKind,
  page: number,
  options: { asPublic?: boolean } = {},
): Promise<Response> {
  if (!UUID.test(documentId) || !Number.isInteger(page) || page < 1) return notFound()
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const actor = options.asPublic === true ? null : await getActor(signal)
  const result = await serveDerivative(
    db,
    getObjectStore(),
    actor,
    { documentId, kind, page },
    signal,
  )
  if (!result.ok) return notFound()
  return new Response(Buffer.from(result.value.bytes), {
    status: 200,
    headers: { 'content-type': 'image/png', 'cache-control': 'no-store', etag: result.value.etag },
  })
}

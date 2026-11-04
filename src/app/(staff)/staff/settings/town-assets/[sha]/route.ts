import { NOT_FOUND, toResponse } from '@/features/pdf/pdfResponse'
import { STREAMED_HEADERS } from '@/features/storage/delivery'
import { getObjectStore } from '@/features/storage/objectStore'
import { readTownImage } from '@/features/town/townImages'
import { staffActorOrNull } from '@/server/requireStaff'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REQUEST_TIMEOUT_MS = 30_000

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sha: string }> },
): Promise<Response> {
  const { sha } = await params
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const accept = request.headers.get('accept')
  if ((await staffActorOrNull(signal)) === null) return toResponse(NOT_FOUND, accept)
  const image = await readTownImage(getObjectStore(), sha, signal)
  if (!image.ok) return toResponse(NOT_FOUND, accept)
  return new Response(image.value.bytes as BodyInit, {
    status: 200,
    headers: {
      ...STREAMED_HEADERS,
      'cache-control': 'private, max-age=86400, immutable',
      'content-type': image.value.contentType,
    },
  })
}

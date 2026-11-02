import { db } from '@/db/client'
import { openReleaseVersion } from '@/features/rtk/releaseLinks'
import { streamStoredObject } from '@/features/storage/delivery'
import { getObjectStore } from '@/features/storage/objectStore'
import { formatCivilDate } from '@/lib/formatDate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 30_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EXPIRED_COPY = 'This link has expired. Ask the land use office for a new one.'
const HEADERS = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }

function plain(status: number, body: string): Response {
  return new Response(body, { status, headers: HEADERS })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; versionId: string }> },
): Promise<Response> {
  const { token, versionId } = await params
  if (!UUID.test(versionId)) return plain(404, 'Not found')
  const result = await openReleaseVersion(
    db,
    token,
    versionId,
    new Date(),
    AbortSignal.timeout(TIMEOUT_MS),
  )
  if (result.ok) {
    return (await streamStoredObject(getObjectStore(), result.value)) ?? plain(404, 'Not found')
  }
  if (typeof result.error === 'object') {
    return plain(
      410,
      `This document was withdrawn by the town on ${formatCivilDate(result.error.withdrawnOn)}.`,
    )
  }
  return result.error === 'expired' ? plain(410, EXPIRED_COPY) : plain(404, 'Not found')
}

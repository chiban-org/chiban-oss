import { db } from '@/db/client'
import { openMemberPacketVersion } from '@/features/boards/memberPackets'
import { getObjectStore } from '@/features/storage/objectStore'
import { getActor } from '@/server/getActor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 30_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function plain(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ meetingId: string; versionId: string }> },
): Promise<Response> {
  const { meetingId, versionId } = await params
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const actor = await getActor(signal)
  if (actor === null) return plain(401, 'Sign in to read board packets')
  if (!UUID.test(meetingId) || !UUID.test(versionId)) return plain(404, 'Not found')
  const result = await openMemberPacketVersion(
    db,
    getObjectStore(),
    actor,
    { meetingId, versionId },
    signal,
  )
  if (result.ok) return new Response(null, { status: 302, headers: { location: result.value.url } })
  return plain(404, 'Not found')
}

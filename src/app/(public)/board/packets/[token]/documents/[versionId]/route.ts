import { db } from '@/db/client'
import { packetCoverPdf } from '@/features/boards/cover'
import { openPacket, openPacketVersion } from '@/features/boards/packetLinks'
import { documentFrame } from '@/features/pdf/documentFrame'
import { pdfOk, toResponse } from '@/features/pdf/pdfResponse'
import { streamStoredObject } from '@/features/storage/delivery'
import { getObjectStore } from '@/features/storage/objectStore'
import { formatCivilDate } from '@/lib/formatDate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 30_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EXPIRED_COPY = 'This link has expired. Ask the land use office for a new one.'

function plain(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; versionId: string }> },
): Promise<Response> {
  const { token, versionId } = await params
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const now = new Date()
  if (versionId === 'cover') {
    const opened = await openPacket(db, token, now, signal)
    if (!opened.ok)
      return opened.error === 'expired' ? plain(410, EXPIRED_COPY) : plain(404, 'Not found')
    const frame = await documentFrame(db, { board: opened.value.board }, signal)
    const bytes = await packetCoverPdf(opened.value, frame)
    return toResponse(pdfOk(bytes), request.headers.get('accept'))
  }
  if (!UUID.test(versionId)) return plain(404, 'Not found')
  const result = await openPacketVersion(db, token, versionId, now, signal)
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

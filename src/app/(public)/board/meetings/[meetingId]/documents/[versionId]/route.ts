import { db } from '@/db/client'
import { packetCoverPdf } from '@/features/boards/cover'
import { memberPacketView, openMemberPacketVersion } from '@/features/boards/memberPackets'
import { documentFrame } from '@/features/pdf/documentFrame'
import { pdfOk, toResponse } from '@/features/pdf/pdfResponse'
import { streamStoredObject } from '@/features/storage/delivery'
import { getObjectStore } from '@/features/storage/objectStore'
import { publishedTemplate } from '@/features/templates/findTemplate'
import { formatCivilDate } from '@/lib/formatDate'
import { getActor } from '@/server/getActor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 30_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function plain(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

async function coverResponse(
  request: Request,
  actor: NonNullable<Awaited<ReturnType<typeof getActor>>>,
  meetingId: string,
  signal: AbortSignal,
): Promise<Response> {
  const view = await memberPacketView(db, actor, meetingId, signal)
  if (!view.ok) return plain(404, 'Not found')
  const frame = await documentFrame(db, { boardId: view.value.boardId }, signal)
  const template = await publishedTemplate(db, 'board_packet_cover', signal)
  const bytes = await packetCoverPdf({ ...view.value, expiresAt: '' }, frame, template)
  return toResponse(pdfOk(bytes), request.headers.get('accept'))
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string; versionId: string }> },
): Promise<Response> {
  const { meetingId, versionId } = await params
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const actor = await getActor(signal)
  if (actor === null) return plain(401, 'Sign in to read board packets')
  if (!UUID.test(meetingId)) return plain(404, 'Not found')
  if (versionId === 'cover') return await coverResponse(request, actor, meetingId, signal)
  if (!UUID.test(versionId)) return plain(404, 'Not found')
  const result = await openMemberPacketVersion(db, actor, { meetingId, versionId }, signal)
  if (result.ok) {
    return (await streamStoredObject(getObjectStore(), result.value)) ?? plain(404, 'Not found')
  }
  if (typeof result.error === 'object') {
    return plain(
      410,
      `This document was withdrawn by the town on ${formatCivilDate(result.error.withdrawnOn)}.`,
    )
  }
  return plain(404, 'Not found')
}

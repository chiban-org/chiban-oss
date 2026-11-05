import { db } from '@/db/client'
import { packetCoverPdf } from '@/features/boards/cover'
import { packetCoverPreview } from '@/features/boards/packetCoverPreview'
import { documentFrame } from '@/features/pdf/documentFrame'
import { pdfOk, toResponse } from '@/features/pdf/pdfResponse'
import { publishedTemplate } from '@/features/templates/findTemplate'
import { requireStaffActor } from '@/server/requireStaff'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 30_000

function plain(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
): Promise<Response> {
  const { meetingId } = await params
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const actor = await requireStaffActor(signal)
  const view = await packetCoverPreview(db, actor, meetingId, signal)
  if (!view.ok) {
    return view.error === 'forbidden'
      ? plain(403, 'You do not have permission to prepare board packets.')
      : plain(404, 'Not found')
  }
  const frame = await documentFrame(db, { board: view.value.board }, signal)
  const template = await publishedTemplate(db, 'board_packet_cover', signal)
  const bytes = await packetCoverPdf(view.value, frame, template)
  return toResponse(pdfOk(bytes), request.headers.get('accept'))
}

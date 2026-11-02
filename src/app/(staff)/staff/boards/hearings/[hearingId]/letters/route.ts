import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { hearings } from '@/db/schema'
import { renderNoticeLetters } from '@/features/hearings/noticeLetters'
import { pdfOk, toResponse } from '@/features/pdf/pdfResponse'
import { requireStaffActor } from '@/server/requireStaff'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 30_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function plain(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ hearingId: string }> },
): Promise<Response> {
  const { hearingId } = await params
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const actor = await requireStaffActor(signal)
  if (!UUID.test(hearingId)) return plain(404, 'Not found')
  const [hearing] = await db.select().from(hearings).where(eq(hearings.id, hearingId))
  if (hearing === undefined) return plain(404, 'Not found')
  const letters = await renderNoticeLetters(db, actor, hearing.noticeSetId, signal)
  if (letters.ok) return toResponse(pdfOk(letters.value), request.headers.get('accept'))
  if (letters.error === 'forbidden')
    return plain(403, 'You do not have permission to print notice letters.')
  if (letters.error === 'no_template')
    return plain(409, 'This application type has no hearing notice template.')
  return plain(404, 'Not found')
}

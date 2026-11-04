import { BoardSchema } from '@packs/nh/boardSchema'
import { db } from '@/db/client'
import { FORBIDDEN, pdfOk, toResponse } from '@/features/pdf/pdfResponse'
import { buildSampleLetterPdf } from '@/features/town/samplePdf'
import { staffActorOrNull } from '@/server/requireStaff'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REQUEST_TIMEOUT_MS = 30_000

export async function GET(request: Request): Promise<Response> {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const accept = request.headers.get('accept')
  const actor = await staffActorOrNull(signal)
  if (actor === null) return toResponse(FORBIDDEN, accept)
  const board = BoardSchema.safeParse(new URL(request.url).searchParams.get('board'))
  const built = await buildSampleLetterPdf(
    db,
    actor,
    board.success ? { board: board.data } : {},
    signal,
  )
  return toResponse(built.ok ? pdfOk(built.value) : FORBIDDEN, accept)
}

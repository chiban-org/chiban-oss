import { db } from '@/db/client'
import { FORBIDDEN, toResponse } from '@/features/pdf/pdfResponse'
import { cashReceiptsReport } from '@/features/reports/cashReceipts'
import { toCsv } from '@/features/reports/cashReceiptsCsv'
import { townToday } from '@/features/town/today'
import { staffActorOrNull } from '@/server/requireStaff'
import { parseCivilDate } from '@/types/civilDate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REQUEST_TIMEOUT_MS = 30_000

export async function GET(request: Request): Promise<Response> {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const actor = await staffActorOrNull(signal)
  const accept = request.headers.get('accept')
  if (actor === null) return toResponse(FORBIDDEN, accept)
  const requested = parseCivilDate(new URL(request.url).searchParams.get('date') ?? '')
  const date = requested.ok ? requested.value : await townToday(db, new Date(), signal)
  const report = await cashReceiptsReport(db, actor, { date }, signal)
  if (!report.ok) return toResponse(FORBIDDEN, accept)
  return new Response(toCsv(report.value), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="cash-receipts-${date}.csv"`,
      'cache-control': 'private, no-store',
    },
  })
}

import { db } from '@/db/client'
import { censusBpsReport, censusCsv, incompleteCopy } from '@/features/census/bpsReport'
import { censusPeriod } from '@/features/census/period'
import { townToday } from '@/features/town/today'
import { staffActorOrNull } from '@/server/requireStaff'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 30_000

export async function GET(request: Request): Promise<Response> {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const actor = await staffActorOrNull(signal)
  if (actor === null) return new Response('Not found', { status: 404 })
  const url = new URL(request.url)
  const today = await townToday(db, new Date(), signal)
  const { year, month } = censusPeriod(
    url.searchParams.get('year'),
    url.searchParams.get('month'),
    today,
  )
  const report = await censusBpsReport(db, actor, { year, month }, signal)
  if (!report.ok) return new Response('Not found', { status: 404 })
  if (!report.value.complete) {
    return new Response(`${incompleteCopy(report.value)} before it can be exported.`, {
      status: 409,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    })
  }
  const name = `census-building-permits-${year}${month === null ? '' : `-${String(month).padStart(2, '0')}`}.csv`
  return new Response(censusCsv(report.value), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'no-store',
    },
  })
}

import { db } from '@/db/client'
import { censusBpsReport, censusCsv } from '@/features/census/bpsReport'
import { townToday } from '@/features/town/today'
import { getActor } from '@/server/getActor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 30_000

function integer(value: string | null, fallback: number): number {
  const n = Number(value)
  return Number.isInteger(n) ? n : fallback
}

export async function GET(request: Request): Promise<Response> {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const actor = await getActor(signal)
  if (actor?.kind !== 'staff') return new Response('Not found', { status: 404 })
  const url = new URL(request.url)
  const today = await townToday(db, new Date(), signal)
  const year = integer(url.searchParams.get('year'), Number(today.slice(0, 4)))
  const monthParam = url.searchParams.get('month')
  const month = monthParam === 'year' ? null : integer(monthParam, Number(today.slice(5, 7)))
  const report = await censusBpsReport(db, actor, { year, month }, signal)
  if (!report.ok) return new Response('Not found', { status: 404 })
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

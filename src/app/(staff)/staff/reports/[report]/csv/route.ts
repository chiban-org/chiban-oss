import { db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { FORBIDDEN, NOT_FOUND, toResponse } from '@/features/pdf/pdfResponse'
import { permitVolumeCsv, processingTimeCsv, revenueCsv } from '@/features/reports/csv'
import { permitVolumeReport } from '@/features/reports/permitVolume'
import { processingTimeReport } from '@/features/reports/processingTime'
import type { ReportRange } from '@/features/reports/range'
import { REPORT_KEYS, type ReportKey, resolveRange } from '@/features/reports/rangeInput'
import { revenueReport } from '@/features/reports/revenue'
import { staffActorOrNull } from '@/server/requireStaff'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REQUEST_TIMEOUT_MS = 60_000

export async function GET(
  request: Request,
  context: { params: Promise<{ report: string }> },
): Promise<Response> {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const actor = await staffActorOrNull(signal)
  const accept = request.headers.get('accept')
  if (actor === null) return toResponse(FORBIDDEN, accept)
  const { report } = await context.params
  const key = REPORT_KEYS.find((k) => k === report)
  if (key === undefined) return toResponse(NOT_FOUND, accept)
  const range = await resolveRange(db, new URL(request.url).searchParams, signal)
  const built = await buildCsv(key, actor, range, signal)
  if ('error' in built) {
    if (built.error === 'forbidden') return toResponse(FORBIDDEN, accept)
    return Response.json({ error: 'range_too_long' }, { status: 422 })
  }
  return new Response(built.csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${key}-${range.from}-to-${range.to}.csv"`,
      'cache-control': 'private, no-store',
    },
  })
}

type Built = { csv: string } | { error: 'forbidden' | 'range' }

async function buildCsv(
  report: ReportKey,
  actor: Actor,
  range: ReportRange,
  signal: AbortSignal,
): Promise<Built> {
  if (report === 'permit-volume') {
    const r = await permitVolumeReport(db, actor, range, signal)
    return r.ok ? { csv: permitVolumeCsv(r.value) } : failure(r.error)
  }
  if (report === 'processing-time') {
    const r = await processingTimeReport(db, actor, range, signal)
    return r.ok ? { csv: processingTimeCsv(r.value) } : failure(r.error)
  }
  const r = await revenueReport(db, actor, range, signal)
  return r.ok ? { csv: revenueCsv(r.value) } : failure(r.error)
}

function failure(error: string): Built {
  return { error: error === 'forbidden' ? 'forbidden' : 'range' }
}

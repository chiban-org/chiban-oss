import { db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { censusRangeOf } from '@/features/census/bpsReport'
import { censusPeriod } from '@/features/census/period'
import { FORBIDDEN, NOT_FOUND, toResponse } from '@/features/pdf/pdfResponse'
import { type ExportFormat, exportResponse } from '@/features/reports/exportResponse'
import type { ReportRange } from '@/features/reports/range'
import { REPORT_KEYS, resolveRange } from '@/features/reports/rangeInput'
import { buildReportExport, type ExportReportKey } from '@/features/reports/reportExport'
import { townToday } from '@/features/town/today'
import { parseCivilDate } from '@/types/civilDate'

const REQUEST_TIMEOUT_MS = 60_000

type RouteContext = { params: Promise<{ report: string }> }

interface Resolved {
  report: ExportReportKey
  range: ReportRange
}

type Resolve = (
  request: Request,
  context: RouteContext | undefined,
  signal: AbortSignal,
) => Promise<Resolved | null>

interface Family {
  resolve: Resolve
  denied: (accept: string | null) => Response
  cacheControl?: string
}

export interface ExportRequestInput {
  request: Request
  context?: RouteContext
  actor: Actor | null
  signal: AbortSignal
}

export const exportSignal = (): AbortSignal => AbortSignal.timeout(REQUEST_TIMEOUT_MS)

function handler(family: Family, format: ExportFormat) {
  return async ({ request, context, actor, signal }: ExportRequestInput): Promise<Response> => {
    const accept = request.headers.get('accept')
    if (actor === null) return family.denied(accept)
    const resolved = await family.resolve(request, context, signal)
    if (resolved === null) return toResponse(NOT_FOUND, accept)
    const built = await buildReportExport(db, actor, resolved, signal)
    if (built.ok) return await exportResponse(format, built.value, family.cacheControl)
    if (built.error === 'forbidden') return family.denied(accept)
    if (built.error === 'range') return Response.json({ error: 'range_too_long' }, { status: 422 })
    return new Response(`${built.error.incomplete} before it can be exported.`, {
      status: 409,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    })
  }
}

const forbidden = (accept: string | null) => toResponse(FORBIDDEN, accept)

const rangeReports: Family = {
  denied: forbidden,
  resolve: async (request, context, signal) => {
    const report = context === undefined ? undefined : (await context.params).report
    const key = REPORT_KEYS.find((k) => k === report)
    if (key === undefined) return null
    return { report: key, range: await resolveRange(db, new URL(request.url).searchParams, signal) }
  },
}

const cashReceipts: Family = {
  denied: forbidden,
  resolve: async (request, _context, signal) => {
    const params = new URL(request.url).searchParams
    const requested = parseCivilDate(params.get('date') ?? '')
    const from = requested.ok ? requested.value : await townToday(db, new Date(), signal)
    const through = parseCivilDate(params.get('through') ?? '')
    return { report: 'cash-receipts', range: { from, to: through.ok ? through.value : from } }
  },
}

const census: Family = {
  denied: () => new Response('Not found', { status: 404 }),
  cacheControl: 'no-store',
  resolve: async (request, _context, signal) => {
    const params = new URL(request.url).searchParams
    const today = await townToday(db, new Date(), signal)
    const { year, month } = censusPeriod(params.get('year'), params.get('month'), today)
    const { from, to } = censusRangeOf(year, month)
    return { report: 'census', range: { from, to } as ReportRange }
  },
}

export const rangeReportExport = (format: ExportFormat) => handler(rangeReports, format)
export const cashReceiptsExport = (format: ExportFormat) => handler(cashReceipts, format)
export const censusExport = (format: ExportFormat) => handler(census, format)

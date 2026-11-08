import type { DbOrTx } from '@/db/client'
import { SCHEDULABLE_REPORTS } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import {
  censusBpsReport,
  censusRangeOf,
  censusSheet,
  incompleteCopy,
} from '@/features/census/bpsReport'
import { type ByMethod, cashReceiptsReport } from '@/features/reports/cashReceipts'
import {
  amountsOf,
  CASH_RECEIPTS_HEADER,
  cashReceiptsRows,
} from '@/features/reports/cashReceiptsCsv'
import { permitVolumeReport } from '@/features/reports/permitVolume'
import { processingTimeReport } from '@/features/reports/processingTime'
import type { ReportRange } from '@/features/reports/range'
import { loadReportFields } from '@/features/reports/reportFields'
import {
  permitVolumeSheet,
  processingTimeSheet,
  revenueSheet,
} from '@/features/reports/reportSheets'
import { revenueReport } from '@/features/reports/revenue'
import type { SheetCell } from '@/features/reports/sheet'
import { addDays, daysBetween } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export const EXPORT_REPORTS = SCHEDULABLE_REPORTS
export type ExportReportKey = (typeof SCHEDULABLE_REPORTS)[number]

const TITLES: ReadonlyMap<ExportReportKey, string> = new Map([
  ['permit-volume', 'Permit volume'],
  ['processing-time', 'Processing time'],
  ['revenue', 'Revenue'],
  ['cash-receipts', 'Cash receipts'],
  ['census', 'Census building permits'],
])

export const reportTitle = (report: ExportReportKey): string => TITLES.get(report) ?? report

export interface ReportExport {
  title: string
  basename: string
  rows: SheetCell[][]
}

export type ExportError = 'forbidden' | 'range' | { incomplete: string }

export interface ExportRequest {
  report: ExportReportKey
  range: ReportRange
}

export const MAX_CASH_RECEIPTS_DAYS = 366

type Built = Result<ReportExport, ExportError>

const fail = (error: string): Built => err(error === 'forbidden' ? 'forbidden' : 'range')

function made(report: ExportReportKey, range: ReportRange, rows: SheetCell[][]): Built {
  return ok({
    title: reportTitle(report),
    basename: `${report}-${range.from}-to-${range.to}`,
    rows,
  })
}

function addMethods(a: ByMethod, b: ByMethod): ByMethod {
  return {
    cash: a.cash + b.cash,
    check: a.check + b.check,
    card_present: a.card_present + b.card_present,
    card_online: a.card_online + b.card_online,
    simulated: a.simulated + b.simulated,
  }
}

async function cashReceiptsExport(
  db: DbOrTx,
  actor: Actor,
  range: ReportRange,
  signal: AbortSignal,
) {
  const span = daysBetween(range.from, range.to)
  if (span < 0 || span + 1 > MAX_CASH_RECEIPTS_DAYS) return fail('range')
  const rows: SheetCell[][] = [CASH_RECEIPTS_HEADER]
  let totals: ByMethod = { cash: 0, check: 0, card_present: 0, card_online: 0, simulated: 0 }
  for (let day = 0; day <= span; day += 1) {
    const date = addDays(range.from, day)
    const report = await cashReceiptsReport(db, actor, { date }, signal)
    if (!report.ok) return fail(report.error)
    if (span > 0 && report.value.entryCount === 0) continue
    rows.push(...cashReceiptsRows(report.value))
    totals = addMethods(totals, report.value.totalsByMethod)
  }
  if (span === 0) {
    return ok({ title: 'Cash receipts', basename: `cash-receipts-${range.from}`, rows })
  }
  rows.push([`${range.from} to ${range.to}`, '', 'Total', ...amountsOf(totals)])
  return made('cash-receipts', range, rows)
}

export function censusPeriodOf(range: ReportRange): { year: number; month: number | null } | null {
  const year = Number(range.from.slice(0, 4))
  const month = Number(range.from.slice(5, 7))
  for (const candidate of [month, null]) {
    const whole = censusRangeOf(year, candidate)
    if (whole.from === range.from && whole.to === range.to) return { year, month: candidate }
  }
  return null
}

async function censusExport(db: DbOrTx, actor: Actor, range: ReportRange, signal: AbortSignal) {
  const period = censusPeriodOf(range)
  if (period === null) return fail('range')
  const report = await censusBpsReport(db, actor, period, signal)
  if (!report.ok) return fail(report.error)
  if (!report.value.complete) return err({ incomplete: incompleteCopy(report.value) })
  const suffix = period.month === null ? '' : `-${String(period.month).padStart(2, '0')}`
  return ok({
    title: reportTitle('census'),
    basename: `census-building-permits-${period.year}${suffix}`,
    rows: censusSheet(report.value),
  })
}

export async function buildReportExport(
  db: DbOrTx,
  actor: Actor,
  request: ExportRequest,
  signal: AbortSignal,
): Promise<Built> {
  const { report, range } = request
  if (report === 'cash-receipts') return await cashReceiptsExport(db, actor, range, signal)
  if (report === 'census') return await censusExport(db, actor, range, signal)
  if (report === 'revenue') {
    const r = await revenueReport(db, actor, range, signal)
    return r.ok ? made(report, range, revenueSheet(r.value)) : fail(r.error)
  }
  const fields = await loadReportFields(db, signal)
  if (report === 'permit-volume') {
    const r = await permitVolumeReport(db, actor, range, signal)
    return r.ok ? made(report, range, permitVolumeSheet(r.value, fields.columns)) : fail(r.error)
  }
  const r = await processingTimeReport(db, actor, range, signal)
  return r.ok ? made(report, range, processingTimeSheet(r.value, fields.columns)) : fail(r.error)
}

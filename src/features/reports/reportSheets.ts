import type { PermitVolumeRow } from '@/features/reports/permitVolume'
import type { ProcessingTimeRow } from '@/features/reports/processingTime'
import type { FieldSums, ReportFieldColumn } from '@/features/reports/reportFields'
import type { RevenueRow } from '@/features/reports/revenue'
import { type SheetCell, sheetCsv } from '@/features/reports/sheet'

const CENTS_PER_DOLLAR = 100

const oneDecimal = (n: number | null): SheetCell => (n === null ? null : { decimal: n, places: 1 })

export function fieldCell(column: ReportFieldColumn, sums: FieldSums): SheetCell {
  const value = new Map(Object.entries(sums)).get(column.id)
  if (value === undefined) return null
  return column.type === 'money' ? { cents: Math.round(value * CENTS_PER_DOLLAR) } : value
}

export function permitVolumeSheet(
  rows: readonly PermitVolumeRow[],
  columns: readonly ReportFieldColumn[] = [],
): SheetCell[][] {
  return [
    [
      'Month',
      'Type',
      'Received',
      'Issued',
      'Closed',
      'Denied',
      'Withdrawn',
      ...columns.map((c) => c.label),
    ],
    ...rows.map((r) => [
      r.month,
      r.type,
      r.received,
      r.issued,
      r.closed,
      r.denied,
      r.withdrawn,
      ...columns.map((c) => fieldCell(c, r.fields)),
    ]),
  ]
}

export function processingTimeSheet(
  rows: readonly ProcessingTimeRow[],
  columns: readonly ReportFieldColumn[] = [],
): SheetCell[][] {
  return [
    [
      'Type',
      'Issued',
      'Median days received to issued',
      'P90 days received to issued',
      'Median days complete to decision',
      'Decided on time',
      'Decided late',
      ...columns.map((c) => c.label),
    ],
    ...rows.map((r) => [
      r.type,
      r.issued,
      oneDecimal(r.medianReceivedToIssued),
      oneDecimal(r.p90ReceivedToIssued),
      oneDecimal(r.medianCompleteToDecision),
      r.decidedOnTime,
      r.decidedLate,
      ...columns.map((c) => fieldCell(c, r.fields)),
    ]),
  ]
}

export function revenueSheet(rows: readonly RevenueRow[]): SheetCell[][] {
  return [
    ['Month', 'Fee code', 'Fee', 'Net'],
    ...rows.map((r) => [r.month, r.code, r.label, { cents: r.netCents }]),
  ]
}

export const permitVolumeCsv = (
  rows: readonly PermitVolumeRow[],
  columns: readonly ReportFieldColumn[] = [],
): string => sheetCsv(permitVolumeSheet(rows, columns))

export const processingTimeCsv = (
  rows: readonly ProcessingTimeRow[],
  columns: readonly ReportFieldColumn[] = [],
): string => sheetCsv(processingTimeSheet(rows, columns))

export const revenueCsv = (rows: readonly RevenueRow[]): string => sheetCsv(revenueSheet(rows))

import type { ByMethod, CashReceiptsReport } from '@/features/reports/cashReceipts'
import { REPORT_METHODS } from '@/features/reports/cashReceipts'
import { type SheetCell, sheetCsv } from '@/features/reports/sheet'

export const CASH_RECEIPTS_HEADER: SheetCell[] = [
  'Date',
  'Fee code',
  'Fee',
  'Cash',
  'Check',
  'Card present',
  'Card online',
  'Simulated',
  'Total',
]

export function amountsOf(byMethod: ByMethod): SheetCell[] {
  const total = REPORT_METHODS.reduce((sum, m) => sum + byMethod[m], 0)
  return [...REPORT_METHODS.map((m) => ({ cents: byMethod[m] })), { cents: total }]
}

export function cashReceiptsRows(report: CashReceiptsReport): SheetCell[][] {
  return [
    ...report.rows.map((r) => [report.date, r.feeCode, r.label, ...amountsOf(r.byMethod)]),
    [report.date, '', 'Convenience fee', ...amountsOf(report.convenienceFees)],
    [report.date, '', 'Overpayment', ...amountsOf(report.overpayments)],
    [report.date, '', 'Total', ...amountsOf(report.totalsByMethod)],
  ]
}

export function toCsv(report: CashReceiptsReport): string {
  return sheetCsv([CASH_RECEIPTS_HEADER, ...cashReceiptsRows(report)])
}

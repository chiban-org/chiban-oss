import type { ByMethod, CashReceiptsReport } from '@/features/reports/cashReceipts'
import { REPORT_METHODS } from '@/features/reports/cashReceipts'
import { dollars, toCsvRows } from '@/features/reports/csv'

const HEADER = [
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
function amountsOf(byMethod: ByMethod): string[] {
  const total = REPORT_METHODS.reduce((sum, m) => sum + byMethod[m], 0)
  return [...REPORT_METHODS.map((m) => dollars(byMethod[m])), dollars(total)]
}

export function toCsv(report: CashReceiptsReport): string {
  return toCsvRows([
    HEADER,
    ...report.rows.map((r) => [report.date, r.feeCode, r.label, ...amountsOf(r.byMethod)]),
    [report.date, '', 'Convenience fee', ...amountsOf(report.convenienceFees)],
    [report.date, '', 'Overpayment', ...amountsOf(report.overpayments)],
    [report.date, '', 'Total', ...amountsOf(report.totalsByMethod)],
  ])
}

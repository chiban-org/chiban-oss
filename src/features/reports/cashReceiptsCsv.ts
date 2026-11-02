import type { ByMethod, CashReceiptsReport } from '@/features/reports/cashReceipts'
import { REPORT_METHODS } from '@/features/reports/cashReceipts'

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
const CRLF = '\r\n'

function dollars(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function line(fields: string[]): string {
  return fields.map(csvField).join(',')
}

function amountsOf(byMethod: ByMethod): string[] {
  const total = REPORT_METHODS.reduce((sum, m) => sum + byMethod[m], 0)
  return [...REPORT_METHODS.map((m) => dollars(byMethod[m])), dollars(total)]
}

export function toCsv(report: CashReceiptsReport): string {
  const lines = [
    line(HEADER),
    ...report.rows.map((r) => line([report.date, r.feeCode, r.label, ...amountsOf(r.byMethod)])),
    line([report.date, '', 'Convenience fee', ...amountsOf(report.convenienceFees)]),
    line([report.date, '', 'Overpayment', ...amountsOf(report.overpayments)]),
    line([report.date, '', 'Total', ...amountsOf(report.totalsByMethod)]),
  ]
  return `${lines.join(CRLF)}${CRLF}`
}

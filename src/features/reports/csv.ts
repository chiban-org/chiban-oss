import type { PermitVolumeRow } from '@/features/reports/permitVolume'
import type { ProcessingTimeRow } from '@/features/reports/processingTime'
import type { RevenueRow } from '@/features/reports/revenue'

const CRLF = '\r\n'

export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

export function toCsvRows(rows: string[][]): string {
  return `${rows.map((r) => r.map(csvField).join(',')).join(CRLF)}${CRLF}`
}

export function dollars(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

const oneDecimal = (n: number | null): string => (n === null ? '' : n.toFixed(1))
const count = (n: number | null): string => (n === null ? '' : String(n))

export function permitVolumeCsv(rows: PermitVolumeRow[]): string {
  return toCsvRows([
    ['Month', 'Type', 'Received', 'Issued', 'Closed', 'Denied', 'Withdrawn'],
    ...rows.map((r) => [
      r.month,
      r.type,
      ...[r.received, r.issued, r.closed, r.denied, r.withdrawn].map(String),
    ]),
  ])
}

export function processingTimeCsv(rows: ProcessingTimeRow[]): string {
  return toCsvRows([
    [
      'Type',
      'Issued',
      'Median days received to issued',
      'P90 days received to issued',
      'Median days complete to decision',
      'Decided on time',
      'Decided late',
    ],
    ...rows.map((r) => [
      r.type,
      String(r.issued),
      oneDecimal(r.medianReceivedToIssued),
      oneDecimal(r.p90ReceivedToIssued),
      oneDecimal(r.medianCompleteToDecision),
      count(r.decidedOnTime),
      count(r.decidedLate),
    ]),
  ])
}

export function revenueCsv(rows: RevenueRow[]): string {
  return toCsvRows([
    ['Month', 'Fee code', 'Fee', 'Net'],
    ...rows.map((r) => [r.month, r.code, r.label, dollars(r.netCents)]),
  ])
}

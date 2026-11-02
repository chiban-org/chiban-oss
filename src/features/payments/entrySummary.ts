import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'

export interface SummarizedEntry {
  businessDate: string
  entryType: string
  method: string
  checkNumber: string | null
  amountCents: number
  payerName: string
}

function words(value: string): string {
  return value.replaceAll('_', ' ')
}

export function entrySummary(entry: SummarizedEntry): string {
  const check = entry.checkNumber === null ? '' : ` ${entry.checkNumber}`
  return `${formatCivilDate(entry.businessDate)}, ${words(entry.entryType)} by ${words(entry.method)}${check}: ${formatCents(entry.amountCents)} from ${entry.payerName}.`
}

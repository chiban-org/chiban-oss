import { formatCivilDate } from '@/lib/formatDate'

export function lineageEventText(eventKind: string, effectiveDate: string): string {
  return `${eventKind.replaceAll('_', ' ')} effective ${formatCivilDate(effectiveDate)}`
}

export function retiredText(retiredOn: string | null): string {
  return retiredOn === null ? 'Retired' : `Retired ${formatCivilDate(retiredOn)}`
}

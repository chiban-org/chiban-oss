import { formatCivilDate } from '@/lib/formatDate'

export function lineageEventText(eventKind: string, effectiveDate: string): string {
  return `${eventKind.replaceAll('_', ' ')} effective ${formatCivilDate(effectiveDate)}`
}

export function retiredText(retiredOn: string | null): string {
  return retiredOn === null ? 'Retired' : `Retired ${formatCivilDate(retiredOn)}`
}

const ALIAS_SOURCES: ReadonlyMap<string, string> = new Map([
  ['import', 'Parcel import'],
  ['manual', 'Entered by staff'],
  ['override', 'Manual override'],
])

export function aliasSourceText(source: string): string {
  return ALIAS_SOURCES.get(source) ?? source
}

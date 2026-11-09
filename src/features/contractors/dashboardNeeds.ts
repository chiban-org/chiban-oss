import type { ApplicationExtras } from '@/features/contractors/dashboardExtras'
import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'
import { addDays, type CivilDate, compareCivil } from '@/types/civilDate'

export const UPCOMING_DAYS = 7

export type NeedKind = 'pay' | 'documents' | 'result' | 'inspection'

export interface NeedItem {
  key: string
  kind: NeedKind
  text: string
  href: string
  linkLabel: string
}

export interface NeedSource {
  applicationId: string
  number: string
  typeLabel: string
  address: string
  extras: ApplicationExtras
}

const KIND_ORDER: readonly NeedKind[] = ['pay', 'documents', 'result', 'inspection']

function applicationHref(source: NeedSource, suffix = ''): string {
  return `/portal/applications/${source.applicationId}${suffix}`
}

function labelOf(source: NeedSource): string {
  return `${source.typeLabel} ${source.number} at ${source.address}`
}

function itemsOf(source: NeedSource, lastDay: CivilDate): NeedItem[] {
  const { extras } = source
  const items: NeedItem[] = []
  if (extras.dueCents > 0) {
    items.push({
      key: `${source.applicationId}-pay`,
      kind: 'pay',
      text: `${labelOf(source)}: balance due ${formatCents(extras.dueCents)}.`,
      href: applicationHref(source, '#fees-heading'),
      linkLabel: 'Pay',
    })
  }
  if (extras.missingDocuments.length > 0) {
    items.push({
      key: `${source.applicationId}-documents`,
      kind: 'documents',
      text: `${labelOf(source)}: documents requested, ${extras.missingDocuments.join('; ')}.`,
      href: applicationHref(source, '#documents-heading'),
      linkLabel: 'Upload documents',
    })
  }
  for (const owed of extras.resultsOwed) {
    items.push({
      key: `${source.applicationId}-result-${owed.date}-${owed.typeLabel}`,
      kind: 'result',
      text: `${labelOf(source)}: ${owed.typeLabel.toLowerCase()} inspection on ${formatCivilDate(owed.date)} has no result recorded yet.`,
      href: applicationHref(source, '/inspections'),
      linkLabel: 'See inspections',
    })
  }
  for (const next of extras.upcoming.filter((u) => compareCivil(u.date, lastDay) <= 0)) {
    items.push({
      key: `${source.applicationId}-inspection-${next.date}-${next.typeLabel}`,
      kind: 'inspection',
      text: `${labelOf(source)}: ${next.typeLabel.toLowerCase()} inspection on ${formatCivilDate(next.date)}.`,
      href: applicationHref(source, '/inspections'),
      linkLabel: 'See inspections',
    })
  }
  return items
}

export function needsFrom(sources: readonly NeedSource[], today: CivilDate): NeedItem[] {
  const lastDay = addDays(today, UPCOMING_DAYS)
  return sources
    .flatMap((source) => itemsOf(source, lastDay))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
}

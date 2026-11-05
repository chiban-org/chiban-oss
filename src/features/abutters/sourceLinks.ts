import { provenanceText } from '@/features/abutters/reasonText'
import type { Provenance } from '@/features/abutters/resolution'
import type { IncompleteReason } from '@/features/abutters/types'
import { addAssociationHref, noticeContactHref } from '@/features/rosters/links'

export interface SourceLine {
  text: string
  href: string | null
}

export interface IncompleteLine extends SourceLine {
  linkText: string | null
}

const CONTACT_SOURCES: readonly Provenance['source'][] = [
  'association_roster',
  'park_roster',
  'restriction_roster',
]

export function sourceLines(provenance: readonly Provenance[]): SourceLine[] {
  return provenance.map((p) => ({
    text: provenanceText(p),
    href: CONTACT_SOURCES.includes(p.source) ? noticeContactHref(p.ref) : null,
  }))
}

export function incompleteLines(
  reasons: readonly IncompleteReason[],
  labels: ReadonlyMap<string, string>,
): IncompleteLine[] {
  return reasons.map((r) => {
    if (r.code !== 'condo_roster_missing' || r.parcelId === undefined) {
      return { text: r.detail, href: null, linkText: null }
    }
    return {
      text: `Parcel ${labels.get(r.parcelId) ?? ''} is a condominium with no association on file.`,
      href: addAssociationHref(r.parcelId),
      linkText: 'Add its association',
    }
  })
}

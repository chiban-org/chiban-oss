import type { Provenance } from '@/features/abutters/resolution'
import type { CandidateReason } from '@/features/abutters/types'
import { formatCivilDate } from '@/lib/formatDate'

function feet(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} feet`
}

export function reasonText(reason: CandidateReason): string {
  switch (reason.kind) {
    case 'adjacent':
      return 'Touches the property'
    case 'staff_selected':
      return `Added by staff across the ${reason.crossing === 'street' ? 'street' : 'stream'}: ${reason.note}`
    case 'across_between_points':
      return `Across ${reason.featureName ?? 'the street or stream'}, between the projected points`
    case 'across_within_capture':
      return `Across the street or stream, ${feet(reason.distanceFt)} from a projected point`
  }
}

const STATE_WORDS: Record<Provenance['state'], string> = {
  fresh: '',
  stale: ', out of date',
  reviewed: '',
  entered: '',
}

export function ageText(days: number | null): string {
  if (days === null || days === 0) return ''
  return `, ${days} ${days === 1 ? 'day' : 'days'} old`
}

function checkedText(p: Provenance): string | null {
  if (p.checkedOn === undefined || p.checkedOn === p.asOf) return null
  return `, checked ${formatCivilDate(p.checkedOn)}`
}

function asOfText(label: string, p: Provenance): string {
  if (p.asOf === null) return label
  const age = checkedText(p) ?? ageText(p.ageDays)
  return `${label} ${formatCivilDate(p.asOf)}${age}${STATE_WORDS[p.state]}`
}

export function provenanceText(p: Provenance): string {
  switch (p.source) {
    case 'parcel_record':
      return `Parcel layer${STATE_WORDS[p.state]}`
    case 'association_roster':
      return asOfText('Association officer roster as of', p)
    case 'park_roster':
      return asOfText('Manufactured housing park roster as of', p)
    case 'restriction_roster':
      return p.asOf === null
        ? 'Easement and restriction roster'
        : asOfText('Land records checked for restrictions on', p)
    case 'application_professionals':
      return 'Entered for this application'
    case 'regional_contacts':
      return 'From the town regional notice contacts'
    case 'application_form':
      return 'From the application form'
    case 'staff_entry': {
      const replaced =
        p.replaced === undefined
          ? ''
          : ` Replaced ${p.replaced.name}${p.replaced.mailingAddress === null ? '' : `, ${p.replaced.mailingAddress}`}.`
      const when = p.asOf === null ? '' : ` on ${formatCivilDate(p.asOf)}`
      return `Entered by staff${when}: ${p.reason ?? 'no reason given'}.${replaced}`
    }
  }
}

export function reasonLines(reasons: CandidateReason[]): string[] {
  const between = new Set(
    reasons.flatMap((r) => (r.kind === 'across_between_points' ? [r.featureId] : [])),
  )
  return reasons
    .filter((r) => r.kind !== 'across_within_capture' || !between.has(r.featureId))
    .map(reasonText)
}

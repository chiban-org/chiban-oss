import type { DesDetermination, suggestDesProximity } from '@/features/boards/des500'
import { activePack } from '@/features/packs/registry'

export function desText(determination: DesDetermination): string {
  const agency = activePack().labels.environmentalAgencyShort
  if (determination === 'within_500ft') {
    return `Within the distance of a water body: ${agency} receives notice`
  }
  return determination === 'not_within'
    ? 'Not within the distance of a water body'
    : `The notice to ${agency} does not apply`
}

export function suggestionText(
  s: Awaited<ReturnType<typeof suggestDesProximity>>,
  distanceFt: number,
): {
  suggestion: string
  distance: string
  determination: 'within_500ft' | 'not_within' | null
} {
  if (s.state === 'known' || s.state === 'stale') {
    const feet = s.value.withinFt === null ? null : Math.round(s.value.withinFt)
    return {
      determination: s.value.within ? 'within_500ft' : 'not_within',
      suggestion: s.value.within
        ? `The map suggests this parcel is within ${distanceFt} feet of a water body.`
        : `The map suggests this parcel is farther than ${distanceFt} feet from any water body.`,
      distance: feet === null ? '' : `Nearest water body: about ${feet} feet from the parcel.`,
    }
  }
  return {
    suggestion: 'The map cannot suggest an answer because the water layer is not usable.',
    distance: '',
    determination: null,
  }
}

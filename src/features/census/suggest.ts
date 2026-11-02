import type { CensusInput } from '@/features/census/classify'

export interface CensusFacts {
  workType: string | null
  classification: 'residential' | 'nonresidential' | null
  dwellingUnits: number | null
}

export type CensusSuggestion = CensusInput

const EXCLUDED_ZERO = {
  phase: 'whole_building',
  buildings: 0,
  housingUnits: 0,
  valuationDollars: 0,
} as const

export function wholeDollars(raw: unknown): number | null {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : ''
  const [whole = '', fraction, ...rest] = text.replaceAll(',', '').split('.')
  const digits = /^\d+$/
  if (rest.length > 0 || !digits.test(whole)) return null
  if (fraction !== undefined && !digits.test(fraction)) return null
  return Number(whole)
}

function categoryFor(units: number): CensusInput['category'] {
  if (units === 1) return 'single_family'
  if (units === 2) return 'two_unit'
  return units <= 4 ? 'three_four_unit' : 'five_plus_unit'
}

export function suggestCensus(
  facts: CensusFacts,
  values: Record<string, unknown>,
): CensusSuggestion | null {
  if (facts.workType === 'demolition') {
    return { ...EXCLUDED_ZERO, category: 'excluded', excludedReason: 'demolition' }
  }
  if (facts.classification === null) return null
  if (facts.classification === 'nonresidential') {
    return { ...EXCLUDED_ZERO, category: 'excluded', excludedReason: 'nonresidential' }
  }
  const valuation = wholeDollars(values.estimated_cost)
  if (facts.dwellingUnits === null || facts.dwellingUnits < 1 || valuation === null) return null
  return {
    category: categoryFor(facts.dwellingUnits),
    excludedReason: null,
    phase: 'whole_building',
    buildings: 1,
    housingUnits: facts.dwellingUnits,
    valuationDollars: valuation,
  }
}

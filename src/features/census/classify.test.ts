import { describe, expect, it } from 'vitest'
import { type CensusInput, validateCensus } from '@/features/census/classify'
import { suggestCensus } from '@/features/census/suggest'

const base: CensusInput = {
  category: 'single_family',
  excludedReason: null,
  phase: 'whole_building',
  buildings: 1,
  housingUnits: 1,
  valuationDollars: 350000,
}

describe('validateCensus', () => {
  it('four units in one building fit item 104', () => {
    expect(
      validateCensus({
        ...base,
        category: 'three_four_unit',
        housingUnits: 4,
        valuationDollars: 1200000,
      }),
    ).toEqual({ ok: true, value: undefined })
  })

  it('six units in one building do not fit three_four_unit', () => {
    expect(validateCensus({ ...base, category: 'three_four_unit', housingUnits: 6 })).toEqual({
      ok: false,
      error: 'units_do_not_fit_category',
    })
  })

  it('foundation phase with a unit count is phase_counts_must_be_zero', () => {
    expect(
      validateCensus({
        ...base,
        phase: 'foundation_or_finish_only',
        buildings: 0,
        housingUnits: 1,
      }),
    ).toEqual({ ok: false, error: 'phase_counts_must_be_zero' })
    expect(
      validateCensus({
        ...base,
        phase: 'foundation_or_finish_only',
        buildings: 0,
        housingUnits: 0,
        valuationDollars: 0,
      }),
    ).toEqual({ ok: false, error: 'phase_counts_must_be_zero' })
    expect(
      validateCensus({
        ...base,
        phase: 'foundation_or_finish_only',
        buildings: 0,
        housingUnits: 0,
        valuationDollars: 40000,
      }).ok,
    ).toBe(true)
  })

  it('single-family needs one unit per building and a building count', () => {
    expect(validateCensus({ ...base, housingUnits: 2 })).toEqual({
      ok: false,
      error: 'units_do_not_fit_category',
    })
    expect(validateCensus({ ...base, buildings: 0, housingUnits: 0 })).toEqual({
      ok: false,
      error: 'units_do_not_fit_category',
    })
  })

  it('two-unit buildings have twice the buildings in units', () => {
    expect(
      validateCensus({ ...base, category: 'two_unit', buildings: 2, housingUnits: 4 }).ok,
    ).toBe(true)
    expect(
      validateCensus({ ...base, category: 'two_unit', buildings: 1, housingUnits: 3 }).ok,
    ).toBe(false)
  })

  it('five-or-more needs at least five units per building', () => {
    expect(validateCensus({ ...base, category: 'five_plus_unit', housingUnits: 5 }).ok).toBe(true)
    expect(validateCensus({ ...base, category: 'five_plus_unit', housingUnits: 4 }).ok).toBe(false)
    expect(
      validateCensus({ ...base, category: 'five_plus_unit', buildings: 2, housingUnits: 9 }).ok,
    ).toBe(false)
  })

  it('three-and-four allows between three and four units per building', () => {
    const fits = (buildings: number, housingUnits: number) =>
      validateCensus({ ...base, category: 'three_four_unit', buildings, housingUnits }).ok
    expect(fits(2, 6)).toBe(true)
    expect(fits(2, 8)).toBe(true)
    expect(fits(2, 5)).toBe(false)
    expect(fits(2, 9)).toBe(false)
    expect(fits(1, 2)).toBe(false)
  })

  it('excluded needs a reason and carries no counts', () => {
    const excluded = {
      ...base,
      category: 'excluded' as const,
      buildings: 0,
      housingUnits: 0,
      valuationDollars: 0,
    }
    expect(validateCensus(excluded)).toEqual({ ok: false, error: 'excluded_reason_required' })
    expect(validateCensus({ ...excluded, excludedReason: 'addition_or_alteration' }).ok).toBe(true)
    expect(
      validateCensus({ ...excluded, excludedReason: 'addition_or_alteration', buildings: 1 }),
    ).toEqual({
      ok: false,
      error: 'excluded_carries_counts',
    })
    expect(
      validateCensus({
        ...excluded,
        excludedReason: 'addition_or_alteration',
        buildings: 0,
        housingUnits: 0,
        valuationDollars: 185000,
      }),
    ).toEqual({ ok: false, error: 'excluded_carries_counts' })
  })

  it('a reason on a counted category is refused', () => {
    expect(validateCensus({ ...base, excludedReason: 'demolition' })).toEqual({
      ok: false,
      error: 'reason_without_exclusion',
    })
  })
})

describe('suggestCensus', () => {
  const house = { workType: 'building', classification: 'residential', dwellingUnits: 1 } as const

  it('suggestion for an estimated cost of 350000.75 is 350000 dollars', () => {
    expect(suggestCensus(house, { estimated_cost: '350000.75' })).toMatchObject({
      category: 'single_family',
      buildings: 1,
      housingUnits: 1,
      valuationDollars: 350000,
    })
    expect(suggestCensus(house, { estimated_cost: 350000.75 })?.valuationDollars).toBe(350000)
  })

  it('maps unit counts to the four items', () => {
    const units = (n: number) =>
      suggestCensus({ ...house, dwellingUnits: n }, { estimated_cost: '100000' })
    expect(units(2)?.category).toBe('two_unit')
    expect(units(3)?.category).toBe('three_four_unit')
    expect(units(4)).toMatchObject({ category: 'three_four_unit', buildings: 1, housingUnits: 4 })
    expect(units(5)?.category).toBe('five_plus_unit')
    expect(units(40)?.category).toBe('five_plus_unit')
  })

  it('demolition and nonresidential work are excluded', () => {
    expect(
      suggestCensus({ ...house, workType: 'demolition' }, { estimated_cost: '5000' }),
    ).toMatchObject({
      category: 'excluded',
      excludedReason: 'demolition',
      buildings: 0,
      housingUnits: 0,
      valuationDollars: 0,
    })
    expect(
      suggestCensus(
        { workType: 'building', classification: 'nonresidential', dwellingUnits: null },
        {},
      ),
    ).toMatchObject({ category: 'excluded', excludedReason: 'nonresidential' })
  })

  it('returns null when a needed fact is missing', () => {
    expect(
      suggestCensus({ ...house, dwellingUnits: null }, { estimated_cost: '100000' }),
    ).toBeNull()
    expect(
      suggestCensus({ ...house, classification: null }, { estimated_cost: '100000' }),
    ).toBeNull()
    expect(suggestCensus(house, {})).toBeNull()
    expect(suggestCensus(house, { estimated_cost: 'not money' })).toBeNull()
  })
})

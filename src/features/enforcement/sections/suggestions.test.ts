import { describe, expect, it } from 'vitest'
import {
  chipsOf,
  emptyInputs,
  mergeSuggestions,
  notOnList,
  type SuggestionInputs,
  searchSuggestions,
  sourceLabel,
} from './suggestions'

const SETBACK = 'Zoning Ordinance Section 4.2'

function inputs(over: Partial<SuggestionInputs>): SuggestionInputs {
  return { ...emptyInputs(), ...over }
}

describe('merging section suggestions', () => {
  it('ranks past findings of a kind by how often they were cited', () => {
    const merged = mergeSuggestions(
      inputs({
        used: [
          { kind: 'zoning_ordinance', ref: 'Section 7.3', count: 1 },
          { kind: 'zoning_ordinance', ref: 'Section 6.1', count: 4 },
          { kind: 'building_code', ref: 'IRC R105.1', count: 9 },
        ],
      }),
    )
    expect(merged.zoning_ordinance.map((s) => s.value)).toEqual(['Section 6.1', 'Section 7.3'])
    expect(merged.zoning_ordinance[0]?.sources).toEqual([{ kind: 'used', count: 4 }])
  })

  it('merges a past finding with the town list entry it names and keeps both sources', () => {
    const merged = mergeSuggestions(
      inputs({
        used: [{ kind: 'zoning_ordinance', ref: 'zoning ordinance  section 4.2', count: 2 }],
        town: [
          { kind: 'zoning_ordinance', reference: SETBACK, title: 'accessory structure setbacks' },
        ],
      }),
    )
    expect(merged.zoning_ordinance).toHaveLength(1)
    expect(merged.zoning_ordinance[0]).toMatchObject({
      value: `${SETBACK}, accessory structure setbacks`,
      sources: [{ kind: 'used', count: 2 }, { kind: 'town' }],
    })
  })

  it('puts used and town entries before the state building code list', () => {
    const merged = mergeSuggestions(
      inputs({
        town: [{ kind: 'building_code', reference: 'Local amendment 3', title: 'snow load' }],
        stateCode: [{ reference: 'IRC 2021 Section R105.1', title: 'Required', topic: 'permit' }],
        used: [{ kind: 'building_code', ref: 'IRC 2021 Section R314.1', count: 1 }],
      }),
    )
    expect(merged.building_code.map((s) => s.sources[0]?.kind)).toEqual([
      'used',
      'town',
      'state_code',
    ])
    expect(merged.building_code[2]?.value).toBe('IRC 2021 Section R105.1, permit')
  })

  it('puts the case parcel conditions first for permit kinds', () => {
    const merged = mergeSuggestions(
      inputs({
        used: [{ kind: 'permit_condition', ref: 'Hours of work', count: 3 }],
        conditions: [
          {
            kind: 'permit_condition',
            value: 'BP-2026-0005 condition 1: silt fence',
            on: 'BP-2026-0005',
          },
        ],
      }),
    )
    expect(merged.permit_condition.map((s) => s.sources[0]?.kind)).toEqual(['condition', 'used'])
  })

  it('keeps every kind present even when it has no suggestions', () => {
    expect(mergeSuggestions(emptyInputs()).board_decision).toEqual([])
  })
})

describe('chips', () => {
  it('offers the top six suggestions', () => {
    const used = Array.from({ length: 8 }, (_, i) => ({
      kind: 'zoning_ordinance' as const,
      ref: `Section ${String(i + 1)}`,
      count: 10 - i,
    }))
    const list = mergeSuggestions(inputs({ used })).zoning_ordinance
    expect(chipsOf(list).map((s) => s.value)).toEqual([
      'Section 1',
      'Section 2',
      'Section 3',
      'Section 4',
      'Section 5',
      'Section 6',
    ])
  })
})

describe('searching suggestions', () => {
  const list = mergeSuggestions(
    inputs({
      town: [
        { kind: 'zoning_ordinance', reference: SETBACK, title: 'accessory structure setbacks' },
        {
          kind: 'zoning_ordinance',
          reference: 'Zoning Ordinance Section 6.1',
          title: 'uses allowed',
        },
      ],
    }),
  ).zoning_ordinance

  it('finds a section by a word of its title', () => {
    expect(searchSuggestions(list, 'setback').map((s) => s.value)).toEqual([
      `${SETBACK}, accessory structure setbacks`,
    ])
  })

  it('finds a section by its number', () => {
    expect(searchSuggestions(list, '6.1').map((s) => s.value)).toEqual([
      'Zoning Ordinance Section 6.1, uses allowed',
    ])
  })

  it('needs every word typed to match', () => {
    expect(searchSuggestions(list, 'section setback uses')).toEqual([])
  })

  it('ignores case and extra spaces', () => {
    expect(searchSuggestions(list, '  ACCESSORY   struct ')).toHaveLength(1)
  })

  it('lists everything for an empty search', () => {
    expect(searchSuggestions(list, '')).toHaveLength(2)
  })
})

describe('source labels', () => {
  it('says how each suggestion was found', () => {
    expect(sourceLabel({ kind: 'used', count: 4 })).toBe('Used 4 times')
    expect(sourceLabel({ kind: 'used', count: 1 })).toBe('Used once')
    expect(sourceLabel({ kind: 'town' })).toBe('Town list')
    expect(sourceLabel({ kind: 'condition', on: 'BP-2026-0005' })).toBe('Condition on BP-2026-0005')
    expect(sourceLabel({ kind: 'state_code' })).toBe('State building code')
  })
})

describe('typed in findings, not on the list', () => {
  it('reports past references the town list and state list do not cover', () => {
    const report = notOnList(
      inputs({
        used: [
          { kind: 'zoning_ordinance', ref: SETBACK, count: 2 },
          { kind: 'zoning_ordinance', ref: 'Section 9.9 signs', count: 3 },
          { kind: 'building_code', ref: 'IRC 2021 Section R105.1', count: 1 },
          { kind: 'permit_condition', ref: 'BP-2026-0005 condition 1', count: 5 },
        ],
        town: [{ kind: 'zoning_ordinance', reference: SETBACK, title: 'setbacks' }],
        stateCode: [{ reference: 'IRC 2021 Section R105.1', title: 'Required', topic: 'permit' }],
      }),
    )
    expect(report).toEqual([{ kind: 'zoning_ordinance', ref: 'Section 9.9 signs', count: 3 }])
  })
})

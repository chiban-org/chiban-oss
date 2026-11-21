import { ME_PACK } from '@packs/me'
import { SUBSURFACE_WASTEWATER_STARTER } from '@packs/me/starters/subsurfaceWastewater'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { computeFees } from '@/features/fees/computeFees'
import type { FieldValue } from '@/features/forms/validateSubmission'
import { setActivePackForTest } from '@/features/packs/registry'

function fees(values: Record<string, FieldValue>, afterTheFact = false) {
  return computeFees(SUBSURFACE_WASTEWATER_STARTER.feeSchedule, {
    values: { description: 'Replace the septic tank', ...values, after_the_fact: afterTheFact },
    facts: { classification: null, dwellingUnits: null, afterTheFact },
    counts: { abutters: { state: 'known', value: 0, asOf: '2027-03-01' } },
    stage: 'at_approval',
    overrides: [],
  })
}

const total = (values: Record<string, FieldValue>, afterTheFact = false) =>
  fees(values, afterTheFact).totalCents

beforeAll(() => setActivePackForTest(ME_PACK))
afterAll(() => setActivePackForTest(null))

describe('subsurface wastewater component permits', () => {
  it('prices a replacement non-engineered septic tank alone at the Table 4A minimum of $150', () => {
    const computed = fees({ septic_tanks_non_engineered: 1 })
    expect(computed.totalCents).toBe(15000)
    expect(computed.complete).toBe(true)
  })

  it('prices each component-only line at its Table 4A minimum', () => {
    expect(total({ septic_tanks_non_engineered: 1 })).toBe(15000)
    expect(total({ septic_tanks_engineered: 1 })).toBe(8000)
    expect(total({ disposal_fields_engineered: 1 })).toBe(15000)
    expect(total({ disposal_fields_non_engineered: 1 })).toBe(15000)
    expect(total({ treatment_unit_tanks: 1 })).toBe(15000)
    expect(total({ treatment_unit_components: 1 })).toBe(3000)
    expect(total({ other_components: 2 })).toBe(6000)
  })

  it('doubles a component-only fee when work started before the permit', () => {
    expect(total({ septic_tanks_engineered: 1 }, true)).toBe(16000)
  })

  it('labels each component-only line with its Table 4A qualifier', () => {
    const labels = SUBSURFACE_WASTEWATER_STARTER.feeSchedule.lines.map((l) => l.label)
    expect(labels).toEqual(
      expect.arrayContaining([
        'Septic tank only, non-engineered (10-144 CMR ch 241 Table 4A minimum)',
        'Septic tank only, engineered (10-144 CMR ch 241 Table 4A minimum)',
        'Disposal field only, engineered system (10-144 CMR ch 241 Table 4A minimum)',
        'Disposal field only, non-engineered (10-144 CMR ch 241 Table 4A minimum)',
        'Advanced treatment unit, tank (10-144 CMR ch 241 Table 4A minimum)',
        'Advanced treatment unit, component (10-144 CMR ch 241 Table 4A minimum)',
        'Other components: complete pump station, piping, other (10-144 CMR ch 241 Table 4A minimum)',
      ]),
    )
  })
})

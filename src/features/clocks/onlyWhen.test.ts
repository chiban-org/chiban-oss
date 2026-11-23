import { describe, expect, it } from 'vitest'
import { rulesForEvent } from '@/features/clocks/ruleEngine'
import type { ProjectFacts } from '@/features/forms/validateSubmission'
import { type ClockRule, ClockRuleSchema } from '@/features/packs/schema'
import { XX_BOARD_COURT } from '@/test/packs/xx/significance'

const BASE_FACTS: ProjectFacts = { classification: null, dwellingUnits: null, afterTheFact: false }

const DENIED_AND_SIGNIFICANT: ClockRule['onlyWhen'] = [
  { fact: 'outcome', in: ['denied'] },
  { fact: 'significantDecision', is: true },
]

function starts(onlyWhen: ClockRule['onlyWhen'], facts: Partial<ProjectFacts>): boolean {
  const rule: ClockRule = { ...XX_BOARD_COURT, onlyWhen }
  return (
    rulesForEvent([rule], rule.startEvent, new Set([rule.key]), { ...BASE_FACTS, ...facts })
      .length === 1
  )
}

describe('a clock that starts only when every condition holds', () => {
  it('starts when the outcome and the significance both match', () => {
    expect(starts(DENIED_AND_SIGNIFICANT, { outcome: 'denied', significantDecision: true })).toBe(
      true,
    )
  })

  it('does not start when one of the conditions fails', () => {
    expect(starts(DENIED_AND_SIGNIFICANT, { outcome: 'denied', significantDecision: false })).toBe(
      false,
    )
    expect(starts(DENIED_AND_SIGNIFICANT, { outcome: 'approved', significantDecision: true })).toBe(
      false,
    )
  })

  it('reads a decision with no significance flag as not significant', () => {
    const notSignificant: ClockRule['onlyWhen'] = { fact: 'significantDecision', is: false }
    expect(starts(notSignificant, { outcome: 'denied' })).toBe(true)
    expect(starts({ fact: 'significantDecision', is: true }, { outcome: 'denied' })).toBe(false)
  })

  it('keeps a single condition working as before', () => {
    expect(starts({ fact: 'outcome', in: ['denied'] }, { outcome: 'denied' })).toBe(true)
    expect(starts({ fact: 'outcome', in: ['denied'] }, { outcome: 'approved' })).toBe(false)
  })

  it('accepts a list of conditions in a pack and refuses an empty one', () => {
    expect(
      ClockRuleSchema.safeParse({ ...XX_BOARD_COURT, onlyWhen: DENIED_AND_SIGNIFICANT }).success,
    ).toBe(true)
    expect(ClockRuleSchema.safeParse({ ...XX_BOARD_COURT, onlyWhen: [] }).success).toBe(false)
  })
})

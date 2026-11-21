import { describe, expect, it } from 'vitest'
import { factMatches } from '@/features/clocks/ruleEngine'
import { FactConditionSchema } from '@/features/packs/schema'

const BASE = { classification: null, dwellingUnits: null, afterTheFact: false } as const
const PLANNING_LAST = { fact: 'finalReviewBoard', in: ['planning_board'] } as const

describe('the finalReviewBoard clock fact', () => {
  it('matches only the board that gave the last municipal approval', () => {
    const when = { fact: 'finalReviewBoard' as const, in: [...PLANNING_LAST.in] }
    expect(factMatches(when, { ...BASE, finalReviewBoard: 'planning_board' })).toBe(true)
    expect(factMatches(when, { ...BASE, finalReviewBoard: 'zba' })).toBe(false)
    expect(factMatches(when, BASE)).toBe(false)
  })

  it('names at least one board kind', () => {
    expect(FactConditionSchema.safeParse(PLANNING_LAST).success).toBe(true)
    expect(
      FactConditionSchema.safeParse({ fact: 'finalReviewBoard', in: ['selectmen'] }).success,
    ).toBe(false)
    expect(FactConditionSchema.safeParse({ fact: 'finalReviewBoard', in: [] }).success).toBe(false)
  })
})

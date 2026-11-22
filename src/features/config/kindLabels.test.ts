import { describe, expect, it } from 'vitest'
import { emptyKindCopy } from '@/features/config/kindLabels'

describe('emptyKindCopy', () => {
  it('tells staff the starting values are on the State law page and need checking', () => {
    expect(emptyKindCopy('town_rule_setting').description).toBe(
      'Until the town sets a value, Chiban uses the starting value shown for each rule on the State law page. Check them against what the town has adopted.',
    )
  })
})

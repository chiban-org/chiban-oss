import type { ClockRule } from '@packs/nh/schema'
import { describe, expect, it } from 'vitest'
import { allowedAdjustmentKinds } from '@/features/clocks/explainClock'

function rule(extension: ClockRule['extension'], waivable: boolean): ClockRule {
  return { extension, waivable } as ClockRule
}

describe('allowedAdjustmentKinds', () => {
  it('offers only a statutory exception when the rule allows neither extension nor waiver', () => {
    expect(allowedAdjustmentKinds(rule({ allowed: false, note: 'none' }, false))).toEqual([
      'statutory_exception',
    ])
  })

  it('adds extension when the rule allows it', () => {
    expect(allowedAdjustmentKinds(rule({ allowed: true, by: 'applicant_consent' }, false))).toEqual(
      ['extension', 'statutory_exception'],
    )
  })

  it('adds waiver when the rule is waivable', () => {
    expect(allowedAdjustmentKinds(rule({ allowed: false, note: 'none' }, true))).toEqual([
      'waiver',
      'statutory_exception',
    ])
  })
})

import { ME_PACK } from '@packs/me'
import { describe, expect, it } from 'vitest'
import type { EnforcementStatus } from '@/db/schema'
import { withPackForTest } from '@/features/packs/registry'
import { OPEN_FINDING, planFor, planInput } from '@/test/casePlan'
import type { CivilDate } from '@/types/civilDate'
import { cureRules } from './cureRules'
import type { CasePlanInput } from './workPlanInput'

function heldCase(
  status: EnforcementStatus,
  holdPlaced: boolean,
  overrides: Partial<CasePlanInput> = {},
): CasePlanInput {
  return planInput(status, {
    findings: status === 'no_violation' ? [] : OPEN_FINDING,
    cure: {
      rule: cureRules()[0] ?? null,
      notices: [{ findingIds: ['f1'], due: '2026-11-01' as CivilDate, returnReceiptOn: null }],
      holdPlaced,
      civilActionFiled: true,
    },
    ...overrides,
  })
}

const SETTLED = [{ outcomes: [{ kind: 'settled' }] }]

describe('the case moves while a development hold is active', () => {
  it('offers no resolve or close on a case in court with the hold in place', () => {
    withPackForTest(ME_PACK, () => {
      const plan = planFor(heldCase('in_court', true, { referrals: SETTLED }))
      expect(plan.moves).not.toContain('resolved')
      expect(plan.moves).not.toContain('closed')
      expect(plan.now).toMatchObject({ key: 'hold.release', task: 'Release the hold' })
    })
  })

  it('offers no resolve on a violation found case with the hold in place', () => {
    withPackForTest(ME_PACK, () => {
      expect(planFor(heldCase('violation_found', true)).moves).not.toContain('resolved')
    })
  })

  it('names the hold instead of offering close on a no violation case', () => {
    withPackForTest(ME_PACK, () => {
      const plan = planFor(heldCase('no_violation', true))
      expect(plan.moves).toEqual([])
      expect(plan.now).toMatchObject({
        key: 'hold.release',
        task: 'Release the hold',
        action: null,
        note: 'Release it under Development hold before closing the case.',
      })
    })
  })

  it('names the hold instead of offering close on a resolved case', () => {
    withPackForTest(ME_PACK, () => {
      const plan = planFor(heldCase('resolved', true))
      expect(plan.moves).toEqual([])
      expect(plan.now?.key).toBe('hold.release')
    })
  })

  it('offers close again once the hold is released', () => {
    withPackForTest(ME_PACK, () => {
      const plan = planFor(heldCase('no_violation', false))
      expect(plan.moves).toEqual(['closed'])
      expect(plan.now).toBeNull()
    })
  })

  it('names the hold beside the moves when the current step is something else', () => {
    withPackForTest(ME_PACK, () => {
      const plan = planFor(heldCase('violation_found', true))
      expect(plan.now?.key).not.toBe('hold.release')
      expect(plan.heldNote).toBe(
        'Release the development hold before resolving or closing the case.',
      )
    })
  })

  it('names the hold only once when it is already the current step', () => {
    withPackForTest(ME_PACK, () => {
      expect(planFor(heldCase('no_violation', true)).heldNote).toBeNull()
      expect(planFor(heldCase('in_court', true, { referrals: SETTLED })).heldNote).toBeNull()
      expect(planFor(heldCase('violation_found', false)).heldNote).toBeNull()
    })
  })
})

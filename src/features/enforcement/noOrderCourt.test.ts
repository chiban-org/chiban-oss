import { ME_PACK } from '@packs/me'
import { describe, expect, it } from 'vitest'
import { arrangePanels } from '@/components/layout/splitPanels'
import type { EnforcementStatus } from '@/db/schema'
import { withPackForTest } from '@/features/packs/registry'
import { OPEN_FINDING, planFor, planInput } from '@/test/casePlan'
import type { CivilDate } from '@/types/civilDate'
import { counselReferralApplies } from './caseView'
import { cureRules } from './cureRules'
import { casePanelPriority } from './panelPriority'
import { caseStages } from './stageStrip'
import { caseDue } from './workPlan'
import type { CasePlanInput } from './workPlanInput'

const LAPSED = '2026-11-01' as CivilDate

function lapsedCase(
  status: EnforcementStatus,
  remedies: { holdPlaced: boolean; civilActionFiled: boolean },
  overrides: Partial<CasePlanInput> = {},
): CasePlanInput {
  const rule = cureRules()[0] ?? null
  return planInput(status, {
    findings: OPEN_FINDING,
    cure: {
      rule,
      notices: [{ findingIds: ['f1'], due: LAPSED, returnReceiptOn: null }],
      ...remedies,
    },
    ...overrides,
  })
}

const MOTION = [{ outcomes: [{ kind: 'motion_filed' }] }]

describe('a cure case with no statutory order after the remedies', () => {
  it('offers a remedy while one is still untaken', () => {
    withPackForTest(ME_PACK, () => {
      const plan = planFor(
        lapsedCase('violation_found', { holdPlaced: true, civilActionFiled: false }),
      )
      expect(plan.now?.key).toBe('cure.remedy')
      expect(plan.now?.action).toEqual({ kind: 'file_civil_action' })
    })
  })

  it('makes counsel the next step once every offered remedy is taken', () => {
    withPackForTest(ME_PACK, () => {
      const plan = planFor(
        lapsedCase('violation_found', { holdPlaced: true, civilActionFiled: true }),
      )
      expect(plan.now?.key).toBe('counsel.referred')
      expect(plan.now?.task).toBe('Refer the case to town counsel')
    })
  })
})

describe('a case in court with no order', () => {
  it('waits on counsel and lists the counsel requirements', () => {
    withPackForTest(ME_PACK, () => {
      const plan = planFor(
        lapsedCase('in_court', { holdPlaced: true, civilActionFiled: true }, { referrals: MOTION }),
      )
      expect(plan.now).toMatchObject({ key: 'counsel.referred', task: 'Wait for town counsel' })
      expect(plan.groups.map((g) => g.rows.map((r) => r.key))).toEqual([
        ['counsel.referred', 'counsel.decided'],
      ])
      expect(plan.due).toBeNull()
    })
  })

  it('still offers the hold when it was not placed before the motion', () => {
    withPackForTest(ME_PACK, () => {
      const plan = planFor(
        lapsedCase(
          'in_court',
          { holdPlaced: false, civilActionFiled: true },
          { referrals: MOTION },
        ),
      )
      expect(plan.remedies.map((a) => a.kind)).toEqual(['place_hold'])
    })
  })

  it('asks for the hold to be released before resolving once counsel is done', () => {
    withPackForTest(ME_PACK, () => {
      const plan = planFor(
        lapsedCase(
          'in_court',
          { holdPlaced: true, civilActionFiled: true },
          { referrals: [{ outcomes: [{ kind: 'settled' }] }] },
        ),
      )
      expect(plan.now).toMatchObject({ key: 'hold.release', task: 'Release the hold' })
    })
  })

  it('leaves counsel referral open to town counsel', () => {
    expect(counselReferralApplies({ status: 'in_court', stayed: false })).toBe(true)
  })

  it('leads with the counsel and fines panels when the orders panel is empty', () => {
    const panels = ['orders', 'fines', 'counsel', 'findings'].map((key) => ({
      key,
      empty: key === 'orders',
      node: key,
    }))
    const arranged = arrangePanels(panels, {
      lead: casePanelPriority('in_court', false),
      history: [],
    })
    expect(arranged.filled).toEqual(['fines', 'counsel', 'findings'])
    expect(arranged.empty).toEqual(['orders'])
  })

  it('has no due date from an order', () => {
    withPackForTest(ME_PACK, () => {
      expect(
        caseDue(lapsedCase('in_court', { holdPlaced: true, civilActionFiled: true })),
      ).toBeNull()
    })
  })
})

describe('the stage strip when no order is possible', () => {
  const base = {
    stayed: false,
    violationFound: true,
    orderIssued: false,
    inCourt: false,
    overdue: false,
  }

  it('shows no Order issued stage', () => {
    const labels = caseStages({ ...base, status: 'violation_found', orderPossible: false }).map(
      (s) => s.label,
    )
    expect(labels).toEqual([
      'Received',
      'Investigating',
      'Violation found',
      'In court',
      'Resolved',
      'Closed',
    ])
  })

  it('marks In court current on a case with no order', () => {
    const stages = caseStages({ ...base, status: 'in_court', orderPossible: false })
    expect(stages.map((s) => `${s.label}:${s.status}`)).toEqual([
      'Received:done',
      'Investigating:done',
      'Violation found:done',
      'In court:current',
      'Resolved:upcoming',
      'Closed:upcoming',
    ])
  })

  it('keeps Order issued when an order is possible', () => {
    const labels = caseStages({ ...base, status: 'violation_found', orderPossible: true }).map(
      (s) => s.label,
    )
    expect(labels).toContain('Order issued')
  })
})

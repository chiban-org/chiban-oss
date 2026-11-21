import { afterEach, describe, expect, it } from 'vitest'
import { casePenaltyOf } from '@/features/enforcement/casePenalty'
import { penaltyExposure } from '@/features/enforcement/penaltyExposure'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { setActivePackForTest, withPackForTest } from '@/features/packs/registry'
import {
  type CivilPenaltyRule,
  CivilPenaltyRuleSchema,
  PackManifestSchema,
} from '@/features/packs/schema'
import { OPEN_FINDING, planFor, planInput } from '@/test/casePlan'
import { XX_CURE_RANGE, XX_CURE_RULE_KEY } from '@/test/packs/xx/cure'
import { XX_RANGE_PENALTY_KEY } from '@/test/packs/xx/enforcementRules'
import {
  XX_NO_ORDER_PENALTY,
  XX_NO_ORDER_PENALTY_KEY,
  XX_NO_ORDERS,
} from '@/test/packs/xx/noOrders'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate
const NULL_RANGE = XX_NO_ORDER_PENALTY as CivilPenaltyRule
const DATES = {
  noticeReceivedOn: d('2027-02-10'),
  convictedOn: d('2027-02-12'),
  through: d('2027-02-20'),
  offense: 'first' as const,
}

afterEach(() => setActivePackForTest(null))

describe('a civil penalty with no accrual rule', () => {
  it('parses as a range and is refused as a fixed daily penalty', () => {
    expect(CivilPenaltyRuleSchema.safeParse(XX_NO_ORDER_PENALTY).success).toBe(true)
    const fixed = ruleByKey(loadPack(), 'nh.enf.penalty_zoning')
    expect(CivilPenaltyRuleSchema.safeParse({ ...fixed, accrual: null }).success).toBe(false)
  })

  it('has no accrual start from a notice or a conviction', () => {
    expect(penaltyExposure(NULL_RANGE, DATES)).toMatchObject({
      kind: 'range',
      fromDate: null,
      days: 0,
    })
  })

  it('starts from the cure return receipt when the cure path supplies one', () => {
    expect(penaltyExposure(NULL_RANGE, { ...DATES, cureReceiptOn: d('2027-02-15') })).toMatchObject(
      { kind: 'range', fromDate: '2027-02-15', days: 5 },
    )
  })
})

describe('the enforcement penalty role', () => {
  it('accepts the no-order pack and refuses a role that names a rule of another kind', () => {
    expect(PackManifestSchema.safeParse(XX_NO_ORDERS.manifest).success).toBe(true)
    const roles = XX_NO_ORDERS.manifest.roles
    const broken = {
      ...XX_NO_ORDERS.manifest,
      roles: { ...roles, rules: { ...roles.rules, enforcementPenalty: 'xx.enf.answer' } },
    }
    const parsed = PackManifestSchema.safeParse(broken)
    expect(parsed.success ? [] : parsed.error.issues.map((i) => i.message)).toContain(
      'role rules.enforcementPenalty xx.enf.answer must be a civil_penalty rule',
    )
  })

  it('applies after the order and cure rules', () => {
    withPackForTest(XX_NO_ORDERS, () => {
      expect(casePenaltyOf(null, null)).toMatchObject({
        source: 'pack',
        rule: { key: XX_NO_ORDER_PENALTY_KEY },
      })
    })
    withPackForTest(XX_CURE_RANGE, () => {
      expect(casePenaltyOf(null, XX_CURE_RULE_KEY)).toMatchObject({
        source: 'cure',
        rule: { key: XX_RANGE_PENALTY_KEY },
      })
      expect(casePenaltyOf(null, null)).toBeNull()
    })
  })
})

describe('the work plan with no statutory order', () => {
  const noticed = planInput('violation_found', {
    findings: OPEN_FINDING,
    notices: [{ id: 'n1', receivedOn: '2026-11-01' }],
  })

  it('offers no order step or order checklist', () => {
    withPackForTest(XX_NO_ORDERS, () => {
      const plan = planFor(noticed)
      expect(plan.now?.key).toBe('counsel.referred')
      expect(plan.now?.task).toBe('Refer the case to town counsel')
      const keys = plan.groups.flatMap((g) => g.rows.map((r) => r.key))
      expect(keys).toEqual(['finding', 'notice.sent', 'notice.received'])
    })
  })

  it('still drafts an order under the default pack', () => {
    expect(planFor(noticed).now?.key).toBe('order.drafted')
  })
})

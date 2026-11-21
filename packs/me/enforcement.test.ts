import { describe, expect, it } from 'vitest'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { withPackForTest } from '@/features/packs/registry'
import { ME_CLASSIFICATIONS } from './classifications'
import { ME_PACK } from './index'
import { ME_RECORD_SERIES_DEFAULTS } from './recordSeries'
import { ME_ROLES } from './roles'

function rule(key: string) {
  return withPackForTest(ME_PACK, () => ruleByKey(loadPack(), key))
}

describe('me enforcement penalty', () => {
  const penalty = rule('me.enf.penalty')
  if (penalty.kind !== 'civil_penalty' || penalty.model !== 'range_daily') {
    throw new Error('not a range penalty')
  }

  it('has no accrual start and is imposed by the court', () => {
    expect(penalty.accrual).toBeNull()
    expect(penalty.imposedBy).toBe('court')
  })

  it('states the three per-day ranges in cents', () => {
    expect(penalty.categories.map((c) => [c.key, c.minCentsPerDay, c.maxCentsPerDay])).toEqual([
      ['no_permit', 10000, 250000],
      ['specific_violation', 10000, 500000],
      ['resource_protection', 10000, 1000000],
    ])
  })

  it('states the two aggravations', () => {
    expect(penalty.aggravations).toEqual([
      {
        key: 'prior_conviction',
        label: 'Prior conviction within 2 years',
        maxCentsPerDay: 2500000,
      },
      { key: 'economic_benefit', label: 'Economic benefit', maxMultipleOfBenefit: 2 },
    ])
  })
})

describe('me shoreland cure notice', () => {
  it('links the 10 day clock and the penalty, with both remedies', () => {
    const cure = rule('me.enf.cure')
    expect(cure).toMatchObject({
      kind: 'cure_notice',
      occupant: 'if_applicable',
      method: 'certified_mail_return_receipt',
      cureRuleKey: 'me.enf.cure_period',
      penaltyRuleKey: 'me.enf.penalty',
      remedies: { developmentHold: true, civilAction: true },
    })
    expect(rule('me.enf.cure_period')).toMatchObject({
      kind: 'clock',
      clockType: 'action_due',
      startEvent: 'cure_notice_sent',
      length: { unit: 'days', value: 10 },
    })
  })
})

describe('me enforcement classifications', () => {
  const byKey = (key: string) => ME_CLASSIFICATIONS.find((c) => c.key === key)

  it('binds the cure rules only to shoreland, and the penalty to all three', () => {
    expect(byKey('me.enforcement_shoreland')?.mandatoryRuleKeys).toEqual([
      'me.enf.cure',
      'me.enf.cure_period',
      'me.enf.penalty',
    ])
    expect(byKey('me.enforcement_land_use')?.mandatoryRuleKeys).toEqual(['me.enf.penalty'])
    expect(byKey('me.enforcement_plumbing')?.mandatoryRuleKeys).toEqual(['me.enf.penalty'])
  })

  it('lists them in the enforcement role with no order roles', () => {
    expect(ME_ROLES.classifications.enforcement).toEqual([
      'me.enforcement_land_use',
      'me.enforcement_shoreland',
      'me.enforcement_plumbing',
    ])
    expect(ME_ROLES.rules.enforcementPenalty).toBe('me.enf.penalty')
    expect(ME_ROLES.rules.zoningOrder).toBeNull()
    expect(ME_ROLES.rules.buildingCodeOrder).toBeNull()
  })

  it('files all three under the enforcement record series', () => {
    for (const key of ME_ROLES.classifications.enforcement) {
      expect(ME_RECORD_SERIES_DEFAULTS.byClassification[key]).toBe('me.rs.enforcement_files')
    }
  })
})

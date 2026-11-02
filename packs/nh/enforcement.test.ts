import { describe, expect, it } from 'vitest'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'

const ENFORCEMENT_KEYS = [
  'nh.enf.cd_zoning',
  'nh.enf.cd_building',
  'nh.enf.answer_zoning',
  'nh.enf.answer_building',
  'nh.enf.judgment_appeal_zoning',
  'nh.enf.judgment_appeal_building',
  'nh.enf.penalty_zoning',
  'nh.enf.penalty_building',
  'nh.appeal.enforcement_stay',
]

function cd(key: string) {
  const rule = ruleByKey(loadPack(), key)
  if (rule.kind !== 'cease_and_desist') throw new Error('not a cease and desist rule')
  return rule
}

function penalty(key: string) {
  const rule = ruleByKey(loadPack(), key)
  if (rule.kind !== 'civil_penalty') throw new Error('not a civil penalty rule')
  return rule
}

describe('nh enforcement rules', () => {
  it('zoning order rule lists six recipient roles and four server roles', () => {
    const rule = cd('nh.enf.cd_zoning')
    expect(rule.recipientRoles).toHaveLength(6)
    expect(rule.personalServerRoles).toHaveLength(4)
    expect(rule.ownerRoles).toEqual(['record_owner', 'owner_agent'])
    expect(rule.contentFields).toHaveLength(7)
    expect(rule.issuerMustBeDesignated).toBe(true)
    expect(rule.answerRuleKey).toBe('nh.enf.answer_zoning')
    expect(rule.judgmentAppealRuleKey).toBe('nh.enf.judgment_appeal_zoning')
  })

  it('building order rule mirrors the zoning rule with its own keys', () => {
    const rule = cd('nh.enf.cd_building')
    expect(rule.recipientRoles).toEqual(cd('nh.enf.cd_zoning').recipientRoles)
    expect(rule.citation.label).toContain('155-A:8-b')
    expect(rule.answerRuleKey).toBe('nh.enf.answer_building')
    expect(rule.judgmentAppealRuleKey).toBe('nh.enf.judgment_appeal_building')
  })

  it('courtFilingLeadDays is 5 and publicationWeeks is 4', () => {
    for (const key of ['nh.enf.cd_zoning', 'nh.enf.cd_building']) {
      expect(cd(key).courtFilingLeadDays).toBe(5)
      expect(cd(key).ownerNotFoundFallback).toEqual({ posting: true, publicationWeeks: 4 })
    }
  })

  it('penalty rules carry 27500 and 55000 cents per day', () => {
    for (const key of ['nh.enf.penalty_zoning', 'nh.enf.penalty_building']) {
      expect(penalty(key).firstOffenseCentsPerDay).toBe(27500)
      expect(penalty(key).subsequentCentsPerDay).toBe(55000)
    }
    expect(penalty('nh.enf.penalty_building').citation.label).toContain('155-A:8-a')
  })

  it('every enforcement rule cites a gc.nh.gov url', () => {
    for (const key of ENFORCEMENT_KEYS) {
      expect(ruleByKey(loadPack(), key).citation.url).toMatch(/^https:\/\/gc\.nh\.gov\//)
    }
  })

  it('enforcement classifications bind their rules as mandatory', () => {
    const classifications = loadPack().classifications
    const zoning = classifications.find((c) => c.key === 'nh.enforcement_zoning')
    const building = classifications.find((c) => c.key === 'nh.enforcement_building_code')
    expect(zoning?.mandatoryRuleKeys).toContain('nh.enf.cd_zoning')
    expect(zoning?.mandatoryRuleKeys).toContain('nh.appeal.enforcement_stay')
    expect(building?.mandatoryRuleKeys).toContain('nh.enf.cd_building')
    expect(building?.mandatoryRuleKeys).toContain('nh.appeal.enforcement_stay')
  })

  it('answer rules are twenty-day third-party filing windows from service with no extension', () => {
    for (const key of ['nh.enf.answer_zoning', 'nh.enf.answer_building']) {
      const rule = ruleByKey(loadPack(), key)
      if (rule.kind !== 'clock') throw new Error('not a clock')
      expect(rule.length).toEqual({ unit: 'days', value: 20 })
      expect(rule.clockType).toBe('filing_window')
      expect(rule.whose).toBe('third_party')
      expect(rule.startEvent).toBe('order_served')
      expect(rule.extension.allowed).toBe(false)
    }
  })

  it('judgment appeal consequence states only the 15 day appeal right', () => {
    for (const key of ['nh.enf.judgment_appeal_zoning', 'nh.enf.judgment_appeal_building']) {
      const rule = ruleByKey(loadPack(), key)
      if (rule.kind !== 'clock') throw new Error('not a clock rule')
      expect(rule.consequence.text).toBe(
        'A party aggrieved by the judgment may appeal to the superior court within 15 days after it is rendered.',
      )
    }
  })
})

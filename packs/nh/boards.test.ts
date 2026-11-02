import { NH_CLASSIFICATIONS } from '@packs/nh/classifications'
import { PackManifestSchema, PackRuleSchema } from '@packs/nh/schema'
import { describe, expect, it } from 'vitest'
import { computeRuleDue, resolveRuleLength } from '@/features/clocks/ruleEngine'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { checkTownValue } from '@/features/packs/overridePolicy'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate
const adoption = { adoptingAuthority: 'Planning Board', adoptedOn: d('2027-01-12') }

function clock(key: string) {
  const rule = ruleByKey(loadPack(), key)
  if (rule.kind !== 'clock') throw new Error(`${key} is not a clock`)
  return rule
}

function dueFor(
  key: string,
  start: string,
  facts = { classification: null, dwellingUnits: null, afterTheFact: false } as never,
) {
  const rule = clock(key)
  const length = resolveRuleLength(rule, facts, null, undefined)
  return computeRuleDue(rule, length, d(start), packHolidayCalendar()).due
}

const BOARD_CLASSIFICATIONS = NH_CLASSIFICATIONS.filter((c) => c.board !== null)

describe('nh board rules', () => {
  it('nh pack validates with board rules', () => {
    expect(loadPack().id).toBe('nh')
    expect(PackManifestSchema.safeParse(loadPack()).success).toBe(true)
    for (const key of [
      'nh.pb.filing_lead',
      'nh.pb.abutter_list_age',
      'nh.pb.des_500ft',
      'nh.ri.determination',
    ]) {
      expect(ruleByKey(loadPack(), key).citation.url).toMatch(/gc\.nh\.gov/)
    }
  })

  it("every board classification's mandatory keys exist", () => {
    const keys = new Set(loadPack().rules.map((r) => r.key))
    expect(BOARD_CLASSIFICATIONS).toHaveLength(9)
    for (const c of BOARD_CLASSIFICATIONS) {
      for (const k of c.mandatoryRuleKeys) expect(keys.has(k), `${c.key} ${k}`).toBe(true)
    }
  })

  it('before-direction filing window is allowed', () => {
    const base = clock('nh.pb.filing_lead')
    expect(PackRuleSchema.safeParse({ ...base, clockType: 'filing_window' }).success).toBe(true)
    expect(PackRuleSchema.safeParse({ ...base, clockType: 'action_due' }).success).toBe(false)
  })

  it('filing lead before meeting 2027-04-14 is 2027-03-24', () => {
    expect(dueFor('nh.pb.filing_lead', '2027-04-14')).toBe('2027-03-24')
  })

  it('before-direction filing deadline on Saturday 2027-06-05 does not move', () => {
    const rule = clock('nh.pb.filing_lead')
    const result = computeRuleDue(
      rule,
      { unit: 'days', value: 21 },
      d('2027-06-26'),
      packHolidayCalendar(),
    )
    expect(result).toEqual({ due: '2027-06-05', rolledFrom: null })
  })

  it('filing lead of 22 is above_maximum', () => {
    expect(checkTownValue(clock('nh.pb.filing_lead'), { value: 22, ...adoption })).toEqual({
      ok: false,
      error: 'above_maximum',
    })
  })

  it('filing lead of 14 without adopting authority is adoption_record_missing', () => {
    expect(checkTownValue(clock('nh.pb.filing_lead'), { value: 14 })).toEqual({
      ok: false,
      error: 'adoption_record_missing',
    })
  })

  it('filing lead of 14 adopted by the planning board on 2027-01-12 is accepted', () => {
    expect(checkTownValue(clock('nh.pb.filing_lead'), { value: 14, ...adoption }).ok).toBe(true)
  })

  it('the pack value itself needs no adoption record', () => {
    expect(checkTownValue(clock('nh.pb.filing_lead'), { value: 21 }).ok).toBe(true)
  })

  it('pb notice lead of 9 is below_minimum', () => {
    expect(checkTownValue(clock('nh.pb.notice.mail'), { value: 9, ...adoption })).toEqual({
      ok: false,
      error: 'below_minimum',
    })
  })

  it('zba exercise of 18 months is below_minimum', () => {
    expect(checkTownValue(clock('nh.zba.exercise'), { value: 18, ...adoption })).toEqual({
      ok: false,
      error: 'below_minimum',
    })
  })

  it('zba decision 90 days from receipt 2027-03-02 is 2027-05-31', () => {
    expect(dueFor('nh.zba.decision', '2027-03-02')).toBe('2027-05-31')
  })

  it('zba hearing 45 days from receipt 2027-03-02 is 2027-04-16', () => {
    expect(dueFor('nh.zba.hearing', '2027-03-02')).toBe('2027-04-16')
  })

  it('pb decision is 65 days, or 95 with regional impact', () => {
    const plain = { classification: null, dwellingUnits: null, afterTheFact: false }
    expect(dueFor('nh.pb.decision', '2027-04-14', plain as never)).toBe('2027-06-18')
    expect(
      dueFor('nh.pb.decision', '2027-04-14', { ...plain, regionalImpact: true } as never),
    ).toBe('2027-07-18')
  })

  it('equitable waiver does not bind nh.zba.decision', () => {
    const waiver = NH_CLASSIFICATIONS.find((c) => c.key === 'nh.zba_equitable_waiver')
    expect(waiver?.mandatoryRuleKeys).not.toContain('nh.zba.decision')
    expect(waiver?.mandatoryRuleKeys).not.toContain('nh.zba.exercise')
    const variance = NH_CLASSIFICATIONS.find((c) => c.key === 'nh.zba_variance')
    expect(variance?.mandatoryRuleKeys).toContain('nh.zba.decision')
  })

  it('the design review binds notice and no decision clock', () => {
    const review = NH_CLASSIFICATIONS.find((c) => c.key === 'nh.pb_design_review')
    expect(review?.mandatoryRuleKeys).toContain('nh.pb.notice.mail')
    expect(review?.mandatoryRuleKeys).not.toContain('nh.pb.decision')
  })

  it('the zba list has no sealed professional and the rehearing motion has no abutters', () => {
    const variance = NH_CLASSIFICATIONS.find((c) => c.key === 'nh.zba_variance')
    const planning = NH_CLASSIFICATIONS.find((c) => c.key === 'nh.pb_site_plan')
    expect(variance?.abutters?.roles).not.toContain('sealed_professional')
    expect(planning?.abutters?.roles).toContain('sealed_professional')
    expect(NH_CLASSIFICATIONS.find((c) => c.key === 'nh.zba_rehearing_motion')?.abutters).toBeNull()
    expect(variance?.abutters?.conditionalRoles.map((c) => c.when)).not.toContain(
      'des_within_500ft',
    )
  })
})

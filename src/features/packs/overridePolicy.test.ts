import type { OverridePolicy, PackRule } from '@packs/nh/schema'
import { describe, expect, it } from 'vitest'
import { checkTownValue } from '@/features/packs/overridePolicy'
import type { CivilDate } from '@/types/civilDate'

function settingRule(overridePolicy: OverridePolicy): PackRule {
  return {
    kind: 'town_setting',
    key: 'test.setting',
    version: 1,
    label: 'Test',
    citation: { label: 'RSA test', url: 'https://example.test' },
    unit: 'days',
    overridePolicy,
  }
}

const adoption = { adoptingAuthority: 'Select Board', adoptedOn: '2027-01-05' as CivilDate }

describe('checkTownValue', () => {
  it('fixed refuses any value', () => {
    const r = checkTownValue(settingRule({ policy: 'fixed' }), { value: 5 })
    expect(r).toEqual({ ok: false, error: 'fixed' })
  })

  it('minimum 10 refuses 9 and accepts 12', () => {
    const rule = settingRule({ policy: 'minimum', floor: 10 })
    expect(checkTownValue(rule, { value: 9 })).toEqual({ ok: false, error: 'below_minimum' })
    expect(checkTownValue(rule, { value: 12 }).ok).toBe(true)
  })

  it('maximum 21 refuses 22 and accepts 14', () => {
    const rule = settingRule({ policy: 'maximum', ceiling: 21 })
    expect(checkTownValue(rule, { value: 22 })).toEqual({ ok: false, error: 'above_maximum' })
    expect(checkTownValue(rule, { value: 14 }).ok).toBe(true)
  })

  it('delegated choice without adopting authority and date is adoption_record_missing', () => {
    const rule = settingRule({ policy: 'delegated_choice', default: 12 })
    expect(checkTownValue(rule, { value: 18 })).toEqual({
      ok: false,
      error: 'adoption_record_missing',
    })
    expect(checkTownValue(rule, { value: 18, adoptingAuthority: 'Select Board' })).toEqual({
      ok: false,
      error: 'adoption_record_missing',
    })
    expect(checkTownValue(rule, { value: 18, ...adoption }).ok).toBe(true)
  })

  it('delegated choice outside its range is refused', () => {
    const rule = settingRule({
      policy: 'delegated_choice',
      default: 12,
      range: { min: 6, max: 24 },
    })
    expect(checkTownValue(rule, { value: 36, ...adoption })).toEqual({
      ok: false,
      error: 'outside_delegated_range',
    })
  })

  it('locally prohibited refuses alteration', () => {
    const rule = settingRule({ policy: 'locally_prohibited' })
    expect(checkTownValue(rule, { alter: true })).toEqual({
      ok: false,
      error: 'locally_prohibited',
    })
    expect(checkTownValue(rule, { value: 1, ...adoption })).toEqual({
      ok: false,
      error: 'locally_prohibited',
    })
  })
})

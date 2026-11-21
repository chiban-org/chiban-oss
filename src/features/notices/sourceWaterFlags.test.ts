import { describe, expect, it } from 'vitest'
import { recipientRoleLabel } from '@/features/abutters/recipientRoleLabels'
import { recipientRolesFor } from '@/features/abutters/roles'
import { applies } from '@/features/notices/requirementsFor'
import type { NoticeRequirementRule } from '@/features/packs/schema'

const RULE: NoticeRequirementRule = {
  kind: 'notice_requirement',
  key: 'xx.receipt.water',
  version: 1,
  label: 'Notice to the water supplier',
  citation: { label: 'Vellmora Permit Act 8', url: 'https://example.test/act' },
  channel: 'first_class_mail',
  recipients: { roles: ['water_supplier'] },
  leadRuleKey: 'xx.receipt.lead',
  stage: 'on_receipt',
  onlyWhen: 'source_water_area',
  overridePolicy: { policy: 'fixed' },
}

const flags = (sourceWaterArea: boolean | null) => ({
  regionalImpact: false,
  desWithin: false,
  sourceWaterArea,
})

describe('a source water requirement', () => {
  it('applies only inside a source water area', () => {
    expect(applies(RULE, flags(true), 'on_receipt')).toBe(true)
    expect(applies(RULE, flags(false), 'on_receipt')).toBe(false)
    expect(applies(RULE, flags(null), 'on_receipt')).toBe(false)
  })

  it('applies to no one when the flag is absent', () => {
    expect(applies(RULE, { regionalImpact: false, desWithin: false }, 'on_receipt')).toBe(false)
  })

  it('is left out of the requirements due before a hearing', () => {
    expect(applies(RULE, flags(true))).toBe(false)
  })

  it('adds a conditional water supplier role only inside the area', () => {
    const spec = {
      strategyKey: 's',
      resolverKey: 'r',
      roles: ['applicant' as const],
      conditionalRoles: [{ role: 'water_supplier' as const, when: 'source_water_area' as const }],
    }
    expect(recipientRolesFor(spec, { regionalImpact: false, desWithin: false })).toEqual([
      'applicant',
    ])
    expect(
      recipientRolesFor(spec, { regionalImpact: false, desWithin: false, sourceWaterArea: true }),
    ).toEqual(['applicant', 'water_supplier'])
  })
})

describe('recipient role labels', () => {
  it('names the three receipt recipients', () => {
    expect(recipientRoleLabel('municipal_clerk')).toBe('Municipal clerk')
    expect(recipientRoleLabel('municipal_reviewing_authority')).toBe(
      'Municipal reviewing authority',
    )
    expect(recipientRoleLabel('water_supplier')).toBe('Public water supplier')
  })
})

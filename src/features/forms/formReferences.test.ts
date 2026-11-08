import { BUILDING_DEMOLITION_STARTER } from '@packs/nh/starters/buildingDemolition'
import { describe, expect, it } from 'vitest'
import type { FeeScheduleBody } from '@/features/fees/feeSchema'
import { externalUses, feeFieldRefs, referencesTo } from '@/features/forms/formReferences'
import type { FormBody } from '@/features/forms/formSchema'

const FORM = BUILDING_DEMOLITION_STARTER.form
const FEES = BUILDING_DEMOLITION_STARTER.feeSchedule
const TYPE = { key: 'BP', label: 'Building permit', formKey: 'bp-form', feeScheduleKey: 'bp-fees' }

function indexOf(key: string): number {
  return FORM.fields.findIndex((f) => f.key === key)
}

describe('feeFieldRefs', () => {
  it('collects answer sources and the questions a multiplier tests', () => {
    expect(feeFieldRefs(FEES.lines[0]?.expr ?? { op: 'flat', cents: 0 }).sort()).toEqual([
      'after_the_fact',
      'commercial_sq_ft',
      'finished_sq_ft',
      'unfinished_sq_ft',
    ])
  })
})

describe('externalUses', () => {
  it('names the fee lines of every application type that uses the form', () => {
    const uses = externalUses('bp-form', [TYPE], [{ key: 'bp-fees', body: FEES }])
    expect(uses).toContainEqual({
      fieldKey: 'finished_sq_ft',
      source: 'Fee schedule bp-fees (Building permit)',
      detail: 'Building permit fee',
    })
    expect(uses.filter((u) => u.fieldKey === 'after_the_fact')).toHaveLength(1)
  })

  it('names the required documents whose condition reads a question', () => {
    const typed = { ...TYPE, documents: BUILDING_DEMOLITION_STARTER.applicationType.documents }
    const uses = externalUses('bp-form', [typed], [])
    expect(uses).toContainEqual({
      fieldKey: 'is_owner',
      source: 'Required documents (Building permit)',
      detail: 'Owner authorization is needed only when this answer matches',
    })
  })

  it('ignores application types that use another form', () => {
    const other = { ...TYPE, formKey: 'other-form' }
    expect(externalUses('bp-form', [other], [{ key: 'bp-fees', body: FEES }])).toEqual([])
  })
})

describe('referencesTo', () => {
  const uses = externalUses('bp-form', [TYPE], [{ key: 'bp-fees', body: FEES }])

  it('names other questions whose rules use this question', () => {
    const refs = referencesTo(FORM, indexOf('classification'), uses)
    expect(refs).toContainEqual({
      source: 'Question “Number of dwelling units”',
      detail: 'Show only when and Required only when',
    })
    expect(refs).toContainEqual({
      source: 'Question “Commercial area (sq ft)”',
      detail: 'Show only when',
    })
  })

  it('names the fact a question supplies', () => {
    const refs = referencesTo(FORM, indexOf('dwelling_units'), uses)
    expect(refs.map((r) => r.source)).toContain('Project facts')
  })

  it('names fee schedules and the code that reads a key by name', () => {
    const refs = referencesTo(FORM, indexOf('after_the_fact'), uses)
    expect(refs.map((r) => r.source)).toEqual(
      expect.arrayContaining([
        'Fee schedule bp-fees (Building permit)',
        'Fee editor',
        'Project facts',
      ]),
    )
    const license: FormBody = {
      ...FORM,
      fields: [
        { key: 'contractor_license_number', label: 'License', type: 'text', required: false },
      ],
    }
    expect(referencesTo(license, 0, []).map((r) => r.source)).toEqual([
      'Counter, permit and import',
    ])
  })

  it('a question nothing uses has no references', () => {
    expect(referencesTo(FORM, indexOf('description'), uses)).toEqual([])
  })
})

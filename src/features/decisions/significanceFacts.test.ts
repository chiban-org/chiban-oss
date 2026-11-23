import { ME_PACK } from '@packs/me'
import { SITE_PLAN_STARTER } from '@packs/me/starters/boards/sitePlan'
import { afterEach, describe, expect, it } from 'vitest'
import { significanceQuestion } from '@/features/decisions/significance'
import { loadPack } from '@/features/packs/loadPack'
import { setActivePackForTest } from '@/features/packs/registry'
import type { ProceedingClassification } from '@/features/packs/schema'

afterEach(() => setActivePackForTest(null))

function classification(key: string): ProceedingClassification {
  const found = loadPack().classifications.find((c) => c.key === key)
  if (found === undefined) throw new Error(`no classification ${key}`)
  return found
}

describe('the facts shown beside the significance question', () => {
  it('lists a site plan footprint answer with its field label', () => {
    setActivePackForTest(ME_PACK)
    const question = significanceQuestion(classification('me.pb_site_plan'), {
      fields: SITE_PLAN_STARTER.form.fields,
      values: { building_footprint_sq_ft: 4200, project_description: 'Vellmora feed store' },
    })
    expect(question?.facts).toEqual([
      { label: 'Ground area covered by buildings (square feet)', value: '4200' },
    ])
  })

  it('leaves out tagged fields that have no answer', () => {
    setActivePackForTest(ME_PACK)
    const question = significanceQuestion(classification('me.pb_site_plan'), {
      fields: SITE_PLAN_STARTER.form.fields,
      values: { gross_floor_area_sq_ft: 0, disturbed_acres: '' },
    })
    expect(question?.facts).toEqual([{ label: 'Gross floor area (square feet)', value: '0' }])
  })
})

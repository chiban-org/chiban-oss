import { NH_STARTERS } from '@packs/nh/starters'
import { describe, expect, it } from 'vitest'
import { ApplicationTypeBodySchema } from '@/features/applications/applicationTypeSchema'
import { ConditionLibraryBodySchema } from '@/features/conditions/conditionSchema'
import { exprFieldRefs, FeeScheduleBodySchema } from '@/features/fees/feeSchema'
import { FormBodySchema } from '@/features/forms/formSchema'
import { ChecklistBodySchema } from '@/features/inspections/checklistSchema'
import { loadPack } from '@/features/packs/loadPack'
import { unknownMergeFields } from '@/features/templates/mergeFields'
import { TemplateBodySchema } from '@/features/templates/templateSchema'

describe('NH starters', () => {
  it('ships building, electrical, plumbing, and mechanical/gas first', () => {
    expect(NH_STARTERS.slice(0, 4).map((s) => s.applicationType.prefix)).toEqual([
      'BP',
      'EL',
      'PL',
      'MG',
    ])
  })

  it('no starter template prefixes the town name field with the word Town', () => {
    for (const s of NH_STARTERS) {
      for (const t of s.templates) expect(t.body).not.toMatch(/Town of \{\{town\.name\}\}/)
    }
  })

  it('every starter body passes its schema', () => {
    for (const s of NH_STARTERS) {
      expect(FormBodySchema.safeParse(s.form).success).toBe(true)
      expect(FeeScheduleBodySchema.safeParse(s.feeSchedule).success).toBe(true)
      expect(ConditionLibraryBodySchema.safeParse(s.conditionLibrary).success).toBe(true)
      expect(ApplicationTypeBodySchema.safeParse(s.applicationType).success).toBe(true)
      for (const c of s.checklists) expect(ChecklistBodySchema.safeParse(c).success).toBe(true)
      for (const t of s.templates) expect(TemplateBodySchema.safeParse(t).success).toBe(true)
    }
  })

  it('starter fee field refs exist in its form as numeric fields', () => {
    for (const s of NH_STARTERS) {
      const numeric = new Set(
        s.form.fields
          .filter((f) => ['integer', 'decimal', 'money'].includes(f.type))
          .map((f) => f.key),
      )
      for (const line of s.feeSchedule.lines) {
        for (const ref of exprFieldRefs(line.expr)) expect(numeric.has(ref)).toBe(true)
      }
    }
  })

  it('starter templates use only known merge fields', () => {
    for (const s of NH_STARTERS) {
      for (const t of s.templates) expect(unknownMergeFields(t.body)).toEqual([])
    }
  })

  it('starter references resolve inside the bundle', () => {
    for (const s of NH_STARTERS) {
      const t = s.applicationType
      expect(t.formKey).toBe(s.form.key)
      expect(t.feeScheduleKey).toBe(s.feeSchedule.key)
      expect(t.conditionLibraryKey).toBe(s.conditionLibrary.key)
      expect(t.checklistKeys).toEqual(s.checklists.map((c) => c.key))
      expect(t.templateKeys).toEqual(s.templates.map((x) => x.key))
    }
  })

  it('every starter declares the mandatory bindings of its classification', () => {
    const pack = loadPack()
    for (const s of NH_STARTERS) {
      const mandatory = pack.classifications.find((c) => c.key === s.applicationType.classification)
      for (const k of mandatory?.mandatoryRuleKeys ?? []) {
        expect(s.applicationType.bindings).toContain(k)
      }
    }
  })

  it('every starter has a blocking condition and a permit template', () => {
    for (const s of NH_STARTERS) {
      expect(s.conditionLibrary.conditions.some((c) => c.blocksIssuance)).toBe(true)
      expect(s.templates.some((t) => t.kind === 'permit')).toBe(true)
    }
  })

  it('the building starter matches the specified shape', () => {
    const b = NH_STARTERS.find((s) => s.id === 'nh.starter.building')
    expect(b?.applicationType).toMatchObject({
      prefix: 'BP',
      classification: 'nh.building_permit',
      payTiming: 'at_approval',
      workflow: { allowsDirectIssue: false, closesOn: 'certificate_of_occupancy' },
    })
    expect(b?.checklists.map((c) => c.inspectionType)).toEqual([
      'footing',
      'foundation',
      'framing',
      'insulation',
      'final',
    ])
    expect(b?.applicationType.workflow.substeps.map((x) => `${x.state}:${x.key}`)).toEqual([
      'under_review:plan_review',
      'under_review:zoning_review',
      'issued:inspections',
      'issued:co_pending',
    ])
  })

  it('trade starters issue directly and close on a passed final inspection', () => {
    for (const s of NH_STARTERS.filter(
      (x) => x.applicationType.classification === 'nh.trade_permit',
    )) {
      expect(s.checklists.map((c) => c.inspectionType)).toContain('final')
      expect(s.applicationType).toMatchObject({
        payTiming: 'at_intake',
        workflow: { allowsDirectIssue: true, closesOn: 'final_inspection_passed' },
      })
      expect(s.form.fields.find((f) => f.key === 'contractor_license_number')?.required).toBe(true)
    }
    for (const s of NH_STARTERS.slice(1, 4)) {
      expect(s.checklists.map((c) => c.inspectionType)).toEqual(['rough', 'final'])
    }
  })

  it('starters with checklists name exactly one final checklist', () => {
    for (const s of NH_STARTERS) {
      const needsFinal = s.checklists.length > 0
      expect(s.checklists.filter((c) => c.final)).toHaveLength(needsFinal ? 1 : 0)
      if (needsFinal) expect(s.checklists.find((c) => c.final)?.inspectionType).toBe('final')
    }
  })
})

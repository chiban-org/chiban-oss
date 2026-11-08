import { NH_STARTERS } from '@packs/nh/starters'
import { describe, expect, it } from 'vitest'
import { ApplicationTypeBodySchema } from '@/features/applications/applicationTypeSchema'
import { ConditionLibraryBodySchema } from '@/features/conditions/conditionSchema'
import { exprFieldRefs, FeeScheduleBodySchema } from '@/features/fees/feeSchema'
import { conditionFields } from '@/features/forms/condition'
import { FormBodySchema } from '@/features/forms/formSchema'
import { ChecklistBodySchema } from '@/features/inspections/checklistSchema'
import { loadPack } from '@/features/packs/loadPack'
import { unknownMergeFields } from '@/features/templates/mergeFields'
import { TemplateBodySchema } from '@/features/templates/templateSchema'

const PERMIT_STARTERS = NH_STARTERS.filter((s) =>
  ['final_inspection_passed', 'certificate_of_occupancy'].includes(
    s.applicationType.workflow.closesOn,
  ),
)

describe('NH starters', () => {
  it('ships building, electrical, plumbing, mechanical/gas, the board types, and the local permits', () => {
    expect(NH_STARTERS.map((s) => s.applicationType.prefix)).toEqual([
      'BP',
      'EL',
      'PL',
      'MG',
      'SPR',
      'MSP',
      'SPA',
      'SUB',
      'MSUB',
      'LLA',
      'CUP',
      'DR',
      'MDL',
      'VAR',
      'SE',
      'EW',
      'AAD',
      'RH',
      'DW',
      'SG',
      'HO',
      'AR',
      'SA',
      'CO',
      'SC',
      'TS',
      'STR',
      'VMG',
      'IML',
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

  it('every permit starter has a blocking condition and a permit template', () => {
    for (const s of PERMIT_STARTERS) {
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
      const license = s.form.fields.find((f) => f.key === 'contractor_license_number')
      const byOwnerAllowed = s.form.fields.some((f) => f.key === 'work_by')
      expect(byOwnerAllowed ? license?.requireIf : license?.required).toEqual(
        byOwnerAllowed ? { field: 'work_by', op: 'not_equals', value: 'owner' } : true,
      )
    }
    for (const s of NH_STARTERS.slice(1, 4)) {
      expect(s.checklists.map((c) => c.inspectionType)).toEqual(['rough', 'final'])
    }
  })

  it('every document condition reads a question its own form asks', () => {
    for (const s of NH_STARTERS) {
      const keys = new Set(s.form.fields.map((f) => f.key))
      for (const item of s.applicationType.documents ?? []) {
        for (const field of item.requiredIf === undefined ? [] : conditionFields(item.requiredIf)) {
          expect([s.applicationType.prefix, item.key, keys.has(field)]).toEqual([
            s.applicationType.prefix,
            item.key,
            true,
          ])
        }
      }
    }
  })

  it('board starters ask for state and federal permits only before the decision', () => {
    const boardTypes = NH_STARTERS.filter((s) =>
      ['planning_board', 'zba'].includes(
        loadPack().classifications.find((c) => c.key === s.applicationType.classification)
          ?.boardKind ?? '',
      ),
    )
    expect(boardTypes).toHaveLength(14)
    for (const s of boardTypes) {
      for (const item of s.applicationType.documents ?? []) {
        if (item.stateOrFederalPermit === true) expect(item.stage).toBe('before_decision')
      }
    }
  })

  it('the building starter asks for the septic approval as a document, not a condition', () => {
    const bp = NH_STARTERS[0]
    expect(bp?.conditionLibrary.conditions.map((c) => c.code)).not.toContain('SEPTIC')
    expect(bp?.applicationType.documents?.find((d) => d.key === 'septic_approval')).toMatchObject({
      stage: 'before_issue',
    })
  })

  it('alarm registration and street address need no documents', () => {
    for (const prefix of ['AR', 'SA']) {
      const s = NH_STARTERS.find((x) => x.applicationType.prefix === prefix)
      expect(s?.applicationType.documents ?? []).toEqual([])
    }
  })

  it('every permit starter names exactly one final checklist', () => {
    for (const s of PERMIT_STARTERS) {
      expect(s.checklists.filter((c) => c.final)).toHaveLength(1)
      expect(s.checklists.find((c) => c.final)?.inspectionType).toBe('final')
    }
  })

  it('starters with checklists name exactly one final checklist', () => {
    for (const s of NH_STARTERS) {
      const needsFinal = s.checklists.length > 0
      expect(s.checklists.filter((c) => c.final)).toHaveLength(needsFinal ? 1 : 0)
      if (needsFinal) expect(s.checklists.find((c) => c.final)?.inspectionType).toBe('final')
    }
  })

  it('the merger starters use the local permit classification, review by staff, and no hearing', () => {
    for (const prefix of ['VMG', 'IML']) {
      const s = NH_STARTERS.find((x) => x.applicationType.prefix === prefix)
      expect(s?.applicationType).toMatchObject({
        classification: 'nh.local_permit_other',
        workflow: { allowsDirectIssue: false, closesOn: 'staff_closes' },
      })
      expect(s?.feeSchedule.lines.map((l) => l.code)).toEqual([prefix.toLowerCase()])
    }
  })

  it('the voluntary merger asks for mortgage holder consent only when a mortgage exists', () => {
    const s = NH_STARTERS.find((x) => x.applicationType.prefix === 'VMG')
    const consent = s?.applicationType.documents?.find((d) => d.key === 'mortgage_holder_consents')
    expect(consent).toMatchObject({
      stage: 'before_decision',
      requiredIf: { field: 'has_mortgage', op: 'is_true' },
    })
  })

  it('more than one dwelling asks for the septic design only when a septic system is used', () => {
    const s = NH_STARTERS.find((x) => x.applicationType.prefix === 'MDL')
    const septic = s?.applicationType.documents?.find((d) => d.key === 'septic_design')
    expect(septic).toMatchObject({
      stage: 'before_decision',
      requiredIf: { field: 'septic_system', op: 'is_true' },
    })
  })

  it('the involuntary merger restoration walks records research and governing body review', () => {
    const s = NH_STARTERS.find((x) => x.applicationType.prefix === 'IML')
    expect(s?.applicationType.workflow.substeps.map((x) => `${x.state}:${x.key}`)).toEqual([
      'submitted:filed',
      'under_review:records_research',
      'under_review:governing_body_review',
      'decided:records_updated',
    ])
  })
})

import { ME_PACK } from '@packs/me'
import { ME_STARTERS } from '@packs/me/starters'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApplicationTypeBodySchema } from '@/features/applications/applicationTypeSchema'
import { ConditionLibraryBodySchema } from '@/features/conditions/conditionSchema'
import { computeFees } from '@/features/fees/computeFees'
import { exprFieldRefs, FeeScheduleBodySchema } from '@/features/fees/feeSchema'
import { conditionFields } from '@/features/forms/condition'
import { FormBodySchema } from '@/features/forms/formSchema'
import type { FieldValue } from '@/features/forms/validateSubmission'
import { ChecklistBodySchema } from '@/features/inspections/checklistSchema'
import { InspectionSettingsBodySchema } from '@/features/inspections/settingsSchema'
import { loadPack } from '@/features/packs/loadPack'
import { setActivePackForTest } from '@/features/packs/registry'
import type { StarterBundle } from '@/features/packs/schema'
import { unknownMergeFields } from '@/features/templates/mergeFields'
import { checkTemplate } from '@/features/templates/templateChecks'
import { TemplateBodySchema, type TextTemplateBody } from '@/features/templates/templateSchema'

const PERMIT_PREFIXES = ['BP', 'SLZ', 'LU', 'IP', 'SSW', 'SC', 'DEM', 'SG']
const PERMITS = ME_STARTERS.filter((s) => PERMIT_PREFIXES.includes(s.applicationType.prefix))

function starter(prefix: string): StarterBundle {
  const found = ME_STARTERS.find((s) => s.applicationType.prefix === prefix)
  if (found === undefined) throw new Error(`no ${prefix} starter`)
  return found
}

function fees(prefix: string, values: Record<string, FieldValue>, afterTheFact = false) {
  return computeFees(starter(prefix).feeSchedule, {
    values: { ...values, after_the_fact: afterTheFact },
    facts: { classification: null, dwellingUnits: null, afterTheFact },
    counts: { abutters: { state: 'known', value: 0, asOf: '2027-03-01' } },
    stage: starter(prefix).applicationType.payTiming,
    overrides: [],
  }).totalCents
}

function bindingsOfStarter(s: StarterBundle): string[] {
  const classification = ME_PACK.manifest.classifications.find(
    (c) => c.key === s.applicationType.classification,
  )
  return [...(classification?.mandatoryRuleKeys ?? []), ...s.applicationType.bindings]
}

function allText(s: StarterBundle): string {
  return JSON.stringify(s)
}

beforeAll(() => setActivePackForTest(ME_PACK))
afterAll(() => setActivePackForTest(null))

describe('Maine starters', () => {
  it('ships one starter for each Maine permit and board classification', () => {
    expect(ME_STARTERS.map((s) => s.applicationType.prefix)).toEqual([
      'BP',
      'SLZ',
      'LU',
      'IP',
      'SSW',
      'SC',
      'DEM',
      'SG',
      'VAR',
      'AA',
      'SUB',
      'SPR',
    ])
    const enforcement = new Set(ME_PACK.manifest.roles.classifications.enforcement)
    const applicationClassifications = ME_PACK.manifest.classifications
      .map((c) => c.key)
      .filter((k) => !enforcement.has(k))
    expect(ME_STARTERS.map((s) => s.applicationType.classification).sort()).toEqual(
      [...applicationClassifications].sort(),
    )
    expect(new Set(ME_STARTERS.map((s) => s.id)).size).toBe(ME_STARTERS.length)
  })

  it('every starter body passes its schema', () => {
    for (const s of ME_STARTERS) {
      expect(FormBodySchema.safeParse(s.form).success, s.id).toBe(true)
      expect(FeeScheduleBodySchema.safeParse(s.feeSchedule).success, s.id).toBe(true)
      expect(ConditionLibraryBodySchema.safeParse(s.conditionLibrary).success, s.id).toBe(true)
      expect(ApplicationTypeBodySchema.safeParse(s.applicationType).success, s.id).toBe(true)
      for (const c of s.checklists)
        expect(ChecklistBodySchema.safeParse(c).success, c.key).toBe(true)
      for (const t of s.templates) expect(TemplateBodySchema.safeParse(t).success, t.key).toBe(true)
    }
  })

  it('starter fee field refs exist in its form as numeric fields', () => {
    for (const s of ME_STARTERS) {
      const numeric = new Set(
        s.form.fields
          .filter((f) => ['integer', 'decimal', 'money'].includes(f.type))
          .map((f) => f.key),
      )
      for (const line of s.feeSchedule.lines) {
        for (const ref of exprFieldRefs(line.expr)) expect(numeric.has(ref), ref).toBe(true)
      }
    }
  })

  it('starter templates use only merge fields their kind allows', () => {
    for (const s of ME_STARTERS) {
      for (const t of s.templates) {
        expect(unknownMergeFields(t.body), t.key).toEqual([])
        expect(checkTemplate(t), t.key).toBeNull()
      }
    }
  })

  it('starter references resolve inside the bundle', () => {
    for (const s of ME_STARTERS) {
      const t = s.applicationType
      expect(t.formKey).toBe(s.form.key)
      expect(t.feeScheduleKey).toBe(s.feeSchedule.key)
      expect(t.conditionLibraryKey).toBe(s.conditionLibrary.key)
      expect(t.checklistKeys).toEqual(s.checklists.map((c) => c.key))
      expect(t.templateKeys).toEqual(s.templates.map((x) => x.key))
    }
  })

  it('every starter declares exactly the mandatory bindings of its Maine classification', () => {
    const pack = loadPack()
    const known = new Set(pack.rules.map((r) => r.key))
    for (const s of ME_STARTERS) {
      const classification = pack.classifications.find(
        (c) => c.key === s.applicationType.classification,
      )
      expect(classification, s.id).toBeDefined()
      expect([...s.applicationType.bindings].sort(), s.id).toEqual(
        [...(classification?.mandatoryRuleKeys ?? [])].sort(),
      )
      for (const b of s.applicationType.bindings) expect(known.has(b), b).toBe(true)
    }
  })

  it('every document condition reads a question its own form asks', () => {
    for (const s of ME_STARTERS) {
      const keys = new Set(s.form.fields.map((f) => f.key))
      for (const item of s.applicationType.documents ?? []) {
        for (const field of item.requiredIf === undefined ? [] : conditionFields(item.requiredIf)) {
          expect(keys.has(field), `${s.id} ${item.key} ${field}`).toBe(true)
        }
      }
    }
  })

  it('every permit starter has a blocking condition, a permit template and a denial letter', () => {
    expect(PERMITS).toHaveLength(8)
    for (const s of PERMITS) {
      expect(
        s.conditionLibrary.conditions.some((c) => c.blocksIssuance),
        s.id,
      ).toBe(true)
      expect(
        s.templates.filter((t) => t.kind === 'permit'),
        s.id,
      ).toHaveLength(1)
      const denial = s.templates.find((t) => t.key === `${s.form.key.replace('-form', '')}-denial`)
      expect(denial?.kind, s.id).toBe('letter')
      expect(denial?.body, s.id).toContain('denied')
    }
  })

  it('starters with checklists name exactly one final checklist', () => {
    for (const s of ME_STARTERS) {
      const finals = s.checklists.filter((c) => c.final ?? c.inspectionType === 'final')
      expect(finals, s.id).toHaveLength(s.checklists.length > 0 ? 1 : 0)
    }
  })

  it('the subsurface wastewater permit has exactly the two chapter 241 inspections', () => {
    const ssw = starter('SSW')
    expect(ssw.checklists.map((c) => [c.inspectionType, c.final])).toEqual([
      ['site_preparation', false],
      ['before_covering', true],
    ])
    expect(ssw.checklists.map((c) => c.label)).toEqual([
      'After site preparation (10-144 CMR ch 241 §12.I.5.a)',
      'Before the system is covered (10-144 CMR ch 241 §12.I.5.b)',
    ])
  })

  it('prices the subsurface wastewater components at the Table 4A minimums', () => {
    expect(fees('SSW', { non_engineered_systems: 1 })).toBe(25000)
    expect(fees('SSW', { engineered_systems: 1 })).toBe(20000)
    expect(fees('SSW', { primitive_systems: 1 })).toBe(10000)
    expect(fees('SSW', { grey_waste_fields: 1 })).toBe(3500)
    expect(fees('SSW', { alternative_toilets: 1 })).toBe(5000)
    expect(fees('SSW', { holding_tanks: 1 })).toBe(10000)
    expect(fees('SSW', { first_time_variances: 1 })).toBe(2000)
    expect(fees('SSW', { non_engineered_systems: 1, first_time_variances: 1 })).toBe(27000)
    expect(fees('SSW', { non_engineered_systems: 1 }, true)).toBe(50000)
  })

  it('prices internal plumbing at the Table A minimums', () => {
    expect(fees('IP', { fixture_count: 3 })).toBe(4000)
    expect(fees('IP', { fixture_count: 4 })).toBe(4000)
    expect(fees('IP', { fixture_count: 6 })).toBe(6000)
    expect(fees('IP', { fixture_count: 6, public_sewer_hookups: 1 })).toBe(7000)
    expect(
      fees('IP', {
        fixture_count: 2,
        subsurface_hookups: 1,
        piping_relocations: 1,
        permit_transfers: 1,
      }),
    ).toBe(7000)
    expect(fees('IP', { fixture_count: 6 }, true)).toBe(12000)
  })

  it('prices an internal plumbing permit for only a permit transfer at the minimum plus the transfer', () => {
    expect(fees('IP', { permit_transfers: 1 })).toBe(5000)
  })

  it('prices the seasonal conversion permit at 5000 cents', () => {
    expect(starter('SC').feeSchedule.lines.map((l) => l.expr)).toEqual([
      { op: 'flat', cents: 5000 },
    ])
    expect(fees('SC', {})).toBe(5000)
  })

  it('every other fee line is zero and labelled for the town to set', () => {
    for (const s of ME_STARTERS.filter(
      (x) => !['SSW', 'IP', 'SC'].includes(x.applicationType.prefix),
    )) {
      for (const line of s.feeSchedule.lines) {
        expect(line.label, `${s.id} ${line.code}`).toContain('Set your fee')
        expect(JSON.stringify(line.expr), `${s.id} ${line.code}`).not.toMatch(
          /"(cents|centsPerUnit)":[1-9]/,
        )
      }
    }
  })

  it('no starter text carries New Hampshire statute or board words', () => {
    for (const s of ME_STARTERS.map(allText)) {
      expect(s).not.toMatch(/\bRSA\b|ZBA|[Ss]electmen|Right-to-Know|NHDES|New Hampshire/)
    }
  })

  it('no starter template prefixes the town name field with the word Town', () => {
    for (const s of ME_STARTERS) {
      for (const t of s.templates) {
        expect(t.body).not.toMatch(/Town of \{\{town\.name\}\}/)
      }
    }
  })

  it('the shoreland permit offers the seven Chapter 1000 districts', () => {
    const district = starter('SLZ').form.fields.find((f) => f.key === 'shoreland_district')
    expect(district?.options?.map((o) => o.label)).toEqual([
      'Resource Protection',
      'Stream Protection',
      'Limited Residential',
      'Limited Commercial',
      'General Development I',
      'General Development II',
      'Commercial Fisheries/Maritime Activities',
    ])
  })

  it('no starter with a lapse clock closes on issuance', () => {
    const pack = loadPack()
    for (const s of PERMITS) {
      const lapses = bindingsOfStarter(s).some((key) => {
        const rule = pack.rules.find((r) => r.key === key)
        return rule?.kind === 'clock' && rule.consequence.kind === 'lapse'
      })
      if (lapses) expect(s.applicationType.workflow.closesOn, s.id).not.toBe('issuance')
    }
  })

  it('the inspection settings default passes its schema', () => {
    expect(InspectionSettingsBodySchema.safeParse(ME_PACK.inspectionSettingsDefault).success).toBe(
      true,
    )
  })
})

import { NH_STARTERS } from '@packs/nh/starters'
import {
  MINOR_SUBDIVISION_STARTER,
  SUBDIVISION_STARTER,
} from '@packs/nh/starters/boards/planningBoard'
import { describe, expect, it } from 'vitest'
import { ApplicationTypeBodySchema } from '@/features/applications/applicationTypeSchema'
import { effectiveBindings } from '@/features/config/bindings'
import { computeFees } from '@/features/fees/computeFees'
import { FormBodySchema } from '@/features/forms/formSchema'
import { validateSubmission } from '@/features/forms/validateSubmission'
import { loadPack } from '@/features/packs/loadPack'
import { unknownMergeFields } from '@/features/templates/mergeFields'
import { validateWorkflow } from '@/features/workflow/validateWorkflow'

const BOARD_CLASSIFICATION = /^nh\.(pb|zba)_/
const BOARD = NH_STARTERS.filter((s) =>
  BOARD_CLASSIFICATION.test(s.applicationType.classification ?? ''),
)
const FACTS = { classification: null, dwellingUnits: null, afterTheFact: false }

function shared(values: Record<string, unknown>) {
  return {
    project_description: 'Two lots',
    applicant_mailing_address: '12 Alder Lane, Alder Pond NH',
    owner_authorization: true,
    ...values,
  }
}

describe('board starters, hearing templates', () => {
  it('every board starter ships hearing notice, notice of decision, and decision letter templates', () => {
    for (const starter of BOARD) {
      const kinds = starter.templates.map((t) => t.kind).sort()
      expect(kinds, starter.id).toEqual([
        'decision_letter',
        'hearing_notice',
        'letter',
        'notice_of_decision',
      ])
      for (const t of starter.templates) expect(unknownMergeFields(t.body), t.key).toEqual([])
      for (const t of starter.templates) {
        expect(starter.applicationType.templateKeys, t.key).toContain(t.key)
      }
    }
  })

  it('every board starter workflow satisfies its classification', () => {
    const pack = loadPack()
    for (const starter of BOARD) {
      const classification = pack.classifications.find(
        (c) => c.key === starter.applicationType.classification,
      )
      if (classification === undefined) throw new Error(starter.id)
      expect(
        validateWorkflow(starter.applicationType.workflow, classification),
        starter.id,
      ).toEqual([])
    }
  })
})

describe('board starters', () => {
  it('there are eight planning board and five zba starters', () => {
    expect(
      BOARD.filter((s) => (s.applicationType.classification ?? '').startsWith('nh.pb')),
    ).toHaveLength(8)
    expect(
      BOARD.filter((s) => (s.applicationType.classification ?? '').startsWith('nh.zba')),
    ).toHaveLength(5)
  })

  it('every board starter passes its schemas and binds its classification', () => {
    const pack = loadPack()
    for (const s of BOARD) {
      expect(FormBodySchema.safeParse(s.form).success, s.id).toBe(true)
      expect(ApplicationTypeBodySchema.safeParse(s.applicationType).success, s.id).toBe(true)
      const mandatory =
        pack.classifications.find((c) => c.key === s.applicationType.classification)
          ?.mandatoryRuleKeys ?? []
      expect(effectiveBindings(s.applicationType, pack).sort()).toEqual([...mandatory].sort())
    }
  })

  it('no board starter allows direct issue', () => {
    for (const s of BOARD) expect(s.applicationType.workflow.allowsDirectIssue).toBe(false)
  })

  it('every board starter closes on staff action', () => {
    for (const s of BOARD) expect(s.applicationType.workflow.closesOn).toBe('staff_closes')
  })

  it('SUB with 6 lots prices the application fee at 50000', () => {
    const result = computeFees(SUBDIVISION_STARTER.feeSchedule, {
      values: { lot_count: 6 },
      facts: FACTS,
      counts: { abutters: { state: 'unknown' } },
      stage: 'at_intake',
      overrides: [],
    })
    expect(result.totalCents).toBe(50000)
  })

  it('MSUB with 3 lots prices the application fee at 25000', () => {
    const result = computeFees(MINOR_SUBDIVISION_STARTER.feeSchedule, {
      values: { lot_count: 3 },
      facts: FACTS,
      counts: { abutters: { state: 'unknown' } },
      stage: 'at_intake',
      overrides: [],
    })
    expect(result.totalCents).toBe(25000)
  })

  it('MSUB refuses a lot_count of 4', () => {
    const result = validateSubmission(MINOR_SUBDIVISION_STARTER.form, shared({ lot_count: 4 }), {
      asStaff: false,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.map((e) => e.field)).toContain('lot_count')
  })

  it('SUB refuses a lot_count of 3', () => {
    const result = validateSubmission(SUBDIVISION_STARTER.form, shared({ lot_count: 3 }), {
      asStaff: false,
    })
    expect(result.ok).toBe(false)
  })

  it('notice_mail is pending until an abutter list is issued', () => {
    const pending = computeFees(SUBDIVISION_STARTER.feeSchedule, {
      values: { lot_count: 6 },
      facts: FACTS,
      counts: { abutters: { state: 'unknown' } },
      stage: 'at_notice',
      overrides: [],
    })
    expect(pending.complete).toBe(false)
    const known = computeFees(SUBDIVISION_STARTER.feeSchedule, {
      values: { lot_count: 6 },
      facts: FACTS,
      counts: { abutters: { state: 'known', value: 12, asOf: '2027-03-24' } },
      stage: 'at_notice',
      overrides: [],
    })
    expect(known.totalCents).toBe(12000)
  })

  it('zba starters add the newspaper line and planning starters do not', () => {
    const lines = (id: string) =>
      NH_STARTERS.find((s) => s.id === id)?.feeSchedule.lines.map((l) => l.code)
    expect(lines('nh.starter.zba_variance')).toEqual([
      'application',
      'notice_mail',
      'notice_newspaper',
    ])
    expect(lines('nh.starter.pb_site_plan')).toEqual(['application', 'notice_mail'])
  })
})

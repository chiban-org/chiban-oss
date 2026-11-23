import { ME_PACK } from '@packs/me'
import { ME_STARTERS } from '@packs/me/starters'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { effectiveBindings } from '@/features/config/bindings'
import { computeFees } from '@/features/fees/computeFees'
import { loadPack } from '@/features/packs/loadPack'
import { setActivePackForTest } from '@/features/packs/registry'
import type { StarterBundle } from '@/features/packs/schema'
import { checkTemplate } from '@/features/templates/templateChecks'
import { isDocTemplate } from '@/features/templates/templateSchema'
import { validateWorkflow } from '@/features/workflow/validateWorkflow'

const BOARD_PREFIXES = ['VAR', 'AA', 'SUB', 'SPR']
const BOARD = ME_STARTERS.filter((s) => BOARD_PREFIXES.includes(s.applicationType.prefix))
const FACTS = {
  classification: null,
  dwellingUnits: null,
  afterTheFact: false,
}

function starter(prefix: string): StarterBundle {
  const found = BOARD.find((s) => s.applicationType.prefix === prefix)
  if (found === undefined) throw new Error(`no ${prefix} starter`)
  return found
}

function body(s: StarterBundle, key: string): string {
  const t = s.templates.find((x) => x.key === key)
  if (t === undefined || isDocTemplate(t)) throw new Error(`no ${key} text template`)
  return t.body
}

beforeAll(() => setActivePackForTest(ME_PACK))
afterAll(() => setActivePackForTest(null))

describe('Maine board starters', () => {
  it('there are two Planning Board and two Board of Appeals starters', () => {
    const kinds = BOARD.map(
      (s) =>
        loadPack().classifications.find((c) => c.key === s.applicationType.classification)
          ?.boardKind,
    )
    expect(kinds).toEqual(['zba', 'zba', 'planning_board', 'planning_board'])
  })

  it('every board starter carries a hearing notice, notice of decision, decision letter and decision notice letter', () => {
    for (const s of BOARD) {
      for (const kind of ['hearing_notice', 'notice_of_decision', 'decision_letter']) {
        expect(
          s.templates.filter((t) => t.kind === kind),
          `${s.id} ${kind}`,
        ).toHaveLength(1)
      }
      const slug = s.form.key.replace('-form', '')
      expect(s.templates.find((t) => t.key === `${slug}-decision`)?.kind, s.id).toBe('letter')
      expect(body(s, `${slug}-hearing-notice`), s.id).toContain('{{notice.recipientAddress}}')
      for (const t of s.templates) expect(checkTemplate(t), t.key).toBeNull()
    }
  })

  it('no hearing notice tells the reader why they received it', () => {
    for (const s of BOARD) {
      const slug = s.form.key.replace('-form', '')
      expect(body(s, `${slug}-hearing-notice`), s.id).not.toContain(
        'You are receiving this notice as',
      )
    }
  })

  it('every board form asks for the applicant name', () => {
    for (const s of BOARD) {
      expect(
        s.form.fields.some((f) => f.key === 'applicant_name' && f.required === true),
        s.id,
      ).toBe(true)
    }
  })

  it('every board starter workflow satisfies its classification and binds exactly its mandatory rules', () => {
    const pack = loadPack()
    for (const s of BOARD) {
      const classification = pack.classifications.find(
        (c) => c.key === s.applicationType.classification,
      )
      if (classification === undefined) throw new Error(s.id)
      expect(validateWorkflow(s.applicationType.workflow, classification), s.id).toEqual([])
      expect(effectiveBindings(s.applicationType, pack).sort(), s.id).toEqual(
        [...classification.mandatoryRuleKeys].sort(),
      )
    }
  })

  it('no board starter allows direct issue and every one closes on staff action', () => {
    for (const s of BOARD) {
      expect(s.applicationType.workflow.allowsDirectIssue, s.id).toBe(false)
      expect(s.applicationType.workflow.closesOn, s.id).toBe('staff_closes')
    }
  })

  it('board starters ask for state and federal permits only before the decision', () => {
    for (const s of BOARD) {
      for (const item of s.applicationType.documents ?? []) {
        if (item.stateOrFederalPermit === true) expect(item.stage, item.key).toBe('before_decision')
      }
    }
  })

  it('the variance recording certificate names the owner, the conditions, the date of granting and the deed', () => {
    const certificate = body(starter('VAR'), 'var-recording-certificate')
    expect(starter('VAR').templates.find((t) => t.key === 'var-recording-certificate')?.kind).toBe(
      'letter',
    )
    expect(certificate).toContain('{{parcel.ownerName}}')
    expect(certificate).toContain('{{conditions.list}}')
    expect(certificate).toContain('Date the variance was granted: ____')
    expect(certificate).toContain('Book ____, Page ____ of the last recorded deed')
    expect(certificate).toContain('30-A MRSA §4353(5)')
  })

  it('the administrative appeal has no recording certificate', () => {
    expect(starter('AA').templates.map((t) => t.key)).not.toContain('aa-recording-certificate')
  })

  it('the subdivision carries the dated receipt and the receipt notice letters', () => {
    const sub = starter('SUB')
    expect(body(sub, 'sub-receipt')).toContain('30-A MRSA §4403(3)(A)')
    expect(body(sub, 'sub-receipt')).toContain('Date received: ____')
    expect(body(sub, 'sub-receipt-notice')).toContain('30-A MRSA §4403(3)(A)')
    expect(body(sub, 'sub-receipt-notice')).toContain('abutting property')
  })

  it('the subdivision receipt notice item is pending until an abutter list is issued', () => {
    const sub = starter('SUB')
    expect(sub.feeSchedule.lines.map((l) => l.code)).toEqual(['application', 'receipt_notice'])
    const pending = computeFees(sub.feeSchedule, {
      values: { lot_count: 4 },
      facts: FACTS,
      counts: { abutters: { state: 'unknown' } },
      stage: 'at_notice',
      overrides: [],
    })
    expect(pending.complete).toBe(false)
    expect(pending.lines.find((l) => l.code === 'receipt_notice')?.amount).toHaveProperty('pending')
    const known = computeFees(sub.feeSchedule, {
      values: { lot_count: 4 },
      facts: FACTS,
      counts: { abutters: { state: 'known', value: 12, asOf: '2027-03-24' } },
      stage: 'at_notice',
      overrides: [],
    })
    expect(known.complete).toBe(true)
    expect(known.totalCents).toBe(0)
  })
})

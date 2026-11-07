import { NH_CLASSIFICATIONS } from '@packs/nh/classifications'
import type { ClockRule, DecisionOutcome } from '@packs/nh/schema'
import { StartEventSchema } from '@packs/nh/schema'
import { describe, expect, it } from 'vitest'
import { START_EVENT_LABELS } from '@/features/clocks/explainClock'
import { computeRuleDue, resolveRuleLength, rulesForEvent } from '@/features/clocks/ruleEngine'
import type { ProjectFacts } from '@/features/forms/validateSubmission'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate
const BASE_FACTS: ProjectFacts = { classification: null, dwellingUnits: null, afterTheFact: false }

function clock(key: string): ClockRule {
  const rule = loadPack().rules.find((r) => r.key === key)
  expect(rule, key).toBeDefined()
  if (rule === undefined || rule.kind !== 'clock') throw new Error(`${key} is not a clock`)
  return rule
}

function dueFor(key: string, start: string) {
  const rule = clock(key)
  const length = resolveRuleLength(rule, BASE_FACTS, null, undefined)
  return computeRuleDue(rule, length, d(start), packHolidayCalendar()).due
}

function started(
  event: ClockRule['startEvent'],
  extra: Partial<ProjectFacts>,
  bound: string[],
): string[] {
  return rulesForEvent(loadPack().rules, event, new Set(bound), { ...BASE_FACTS, ...extra })
    .map((r) => r.key)
    .sort()
}

const ALL_DECISION_KEYS = [
  'nh.board.decision_filing',
  'nh.ri.transmittal',
  'nh.appeal.admin_to_zba',
  'nh.appeal.zba_rehearing',
  'nh.appeal.zba_court',
  'nh.appeal.pb_court',
  'nh.appeal.pb_court_after_zba',
  'nh.appeal.amendment_window',
]

describe('nh decision and appeal clocks', () => {
  it('every decision rule is published at version 1 with a statute url', () => {
    for (const key of ALL_DECISION_KEYS) {
      const rule = loadPack().rules.find((r) => r.key === key)
      expect(rule, key).toBeDefined()
      expect(rule?.version).toBe(1)
      expect(rule?.citation.url).toMatch(/gc\.nh\.gov/)
    }
  })

  it('filing clock for a 2027-07-01 vote is due 2027-07-09', () => {
    expect(dueFor('nh.board.decision_filing', '2027-07-01')).toBe('2027-07-09')
  })

  it('filing clock for a 2027-06-09 vote is due 2027-06-16', () => {
    expect(dueFor('nh.board.decision_filing', '2027-06-09')).toBe('2027-06-16')
  })

  it('rehearing due 2027-05-15 rolls to 2027-05-17', () => {
    expect(dueFor('nh.appeal.zba_rehearing', '2027-04-15')).toBe('2027-05-17')
  })

  it('court after rehearing denial 2027-05-20 is 2027-06-21', () => {
    expect(dueFor('nh.appeal.zba_court', '2027-05-20')).toBe('2027-06-21')
  })

  it('planning board court window from 2027-06-09 is 2027-07-09', () => {
    expect(dueFor('nh.appeal.pb_court', '2027-06-09')).toBe('2027-07-09')
  })

  it('administrative appeal from 2027-03-01 is due 2027-03-31', () => {
    expect(dueFor('nh.appeal.admin_to_zba', '2027-03-01')).toBe('2027-03-31')
  })

  it('amendment window from late filing 2027-07-12 is due 2027-08-11', () => {
    expect(dueFor('nh.appeal.amendment_window', '2027-07-12')).toBe('2027-08-11')
  })

  it('transmittal clock starts only with regional impact', () => {
    const bound = ['nh.board.decision_filing', 'nh.ri.transmittal']
    expect(started('board_vote', { regionalImpact: false }, bound)).toEqual([
      'nh.board.decision_filing',
    ])
    expect(started('board_vote', { regionalImpact: true }, bound)).toEqual([
      'nh.board.decision_filing',
      'nh.ri.transmittal',
    ])
  })

  it('amendment window starts only when filing was late', () => {
    const bound = ['nh.appeal.amendment_window']
    expect(started('decision_filed', { decisionFiledLate: false }, bound)).toEqual([])
    expect(started('decision_filed', {}, bound)).toEqual([])
    expect(started('decision_filed', { decisionFiledLate: true }, bound)).toEqual(bound)
  })

  it('zba rehearing window starts for approvals and denials, not for rehearing outcomes', () => {
    const bound = ['nh.appeal.zba_rehearing']
    const outcomes: DecisionOutcome[] = [
      'approved',
      'approved_with_conditions',
      'denied',
      'rehearing_granted',
      'rehearing_denied',
    ]
    const hits = outcomes.filter((outcome) => started('board_vote', { outcome }, bound).length > 0)
    expect(hits).toEqual(['approved', 'approved_with_conditions', 'denied'])
  })

  it('court window after rehearing starts only on a denied rehearing', () => {
    const bound = ['nh.appeal.zba_court']
    expect(started('rehearing_vote', { outcome: 'rehearing_denied' }, bound)).toEqual(bound)
    expect(started('rehearing_vote', { outcome: 'rehearing_granted' }, bound)).toEqual([])
  })

  it('an onlyWhen clock without facts never starts', () => {
    const rules = loadPack().rules
    expect(rulesForEvent(rules, 'decision_filed', new Set(['nh.appeal.amendment_window']))).toEqual(
      [],
    )
  })
})

describe('nh board classifications', () => {
  const boards = NH_CLASSIFICATIONS.filter((c) => c.boardKind !== null)

  it("every board classification's notice requirement keys exist", () => {
    const requirements = new Set(
      loadPack()
        .rules.filter((r) => r.kind === 'notice_requirement')
        .map((r) => r.key),
    )
    expect(requirements.size).toBe(6)
    for (const c of boards) {
      for (const k of c.noticeRequirementKeys)
        expect(requirements.has(k), `${c.key} ${k}`).toBe(true)
    }
    const used = new Set(boards.flatMap((c) => c.noticeRequirementKeys))
    expect([...used].sort()).toEqual([...requirements].sort())
  })

  it('no board classification allows direct issue', () => {
    expect(boards.length).toBe(9)
    expect(boards.every((c) => c.directIssueAllowed === false)).toBe(true)
  })

  it('planning board plan types require the filed and hearing substeps', () => {
    const spr = boards.find((c) => c.key === 'nh.pb_site_plan')
    expect(spr?.requiredSubsteps).toEqual([
      { state: 'submitted', key: 'filed' },
      { state: 'under_review', key: 'hearing' },
    ])
  })

  it('zba types require the hearing substep and bind the decision clocks', () => {
    const var_ = boards.find((c) => c.key === 'nh.zba_variance')
    expect(var_?.requiredSubsteps).toEqual([{ state: 'under_review', key: 'hearing' }])
    expect(var_?.mandatoryRuleKeys).toEqual(
      expect.arrayContaining([
        'nh.board.decision_filing',
        'nh.ri.transmittal',
        'nh.appeal.zba_rehearing',
        'nh.appeal.zba_court',
        'nh.appeal.amendment_window',
      ]),
    )
  })

  it('a rehearing motion binds the decision, filing, and court clocks only', () => {
    const rh = boards.find((c) => c.key === 'nh.zba_rehearing_motion')
    expect(rh?.mandatoryRuleKeys).toEqual(
      expect.arrayContaining(['nh.board.decision_filing', 'nh.appeal.zba_court']),
    )
  })

  it('appeal rights copy cites the statute for each board', () => {
    const spr = boards.find((c) => c.key === 'nh.pb_site_plan')
    const zba = boards.find((c) => c.key === 'nh.zba_variance')
    expect(spr?.appealRights).toContain('RSA 677:15')
    expect(zba?.appealRights).toContain('RSA 677:2')
  })
})

describe('start event labels', () => {
  it('every start event has a human label without underscores', () => {
    for (const event of StartEventSchema.options) {
      const label = START_EVENT_LABELS[event]
      expect(label, event).toBeDefined()
      expect(label).not.toContain('_')
    }
  })
})

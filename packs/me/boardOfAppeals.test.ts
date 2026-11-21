import { describe, expect, it } from 'vitest'
import { recipientRolesFor } from '@/features/abutters/roles'
import { computeRuleDue, resolveRuleLength, rulesForEvent } from '@/features/clocks/ruleEngine'
import { planRequirement } from '@/features/notices/requirementPlan'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { withPackForTest } from '@/features/packs/registry'
import type { ProceedingClassification } from '@/features/packs/schema'
import type { CivilDate } from '@/types/civilDate'
import { ME_PACK } from './index'
import { ME_RECORD_SERIES_DEFAULTS } from './recordSeries'
import { ME_ROLES } from './roles'

const d = (s: string) => s as CivilDate
const SECTION_2691 = 'https://legislature.maine.gov/statutes/30-A/title30-Asec2691.html'
const SECTION_4353 = 'https://legislature.maine.gov/statutes/30-A/title30-Asec4353.html'
const EMPTY_FACTS = { classification: null, dwellingUnits: null, afterTheFact: false }
const BOA_KEYS = ['me.boa_variance', 'me.boa_admin_appeal']
const PB_KEYS = ['me.pb_subdivision', 'me.pb_site_plan']

function classification(key: string): ProceedingClassification {
  const found = ME_PACK.manifest.classifications.find((c) => c.key === key)
  if (found === undefined) throw new Error(`no classification ${key}`)
  return found
}

function rule(key: string) {
  const found = ME_PACK.manifest.rules.find((r) => r.key === key)
  if (found === undefined) throw new Error(`no rule ${key}`)
  return found
}

function clockDue(key: string, start: string): string {
  return withPackForTest(ME_PACK, () => {
    const pack = loadPack()
    const found = ruleByKey(pack, key)
    if (found.kind !== 'clock') throw new Error(`${key} is not a clock`)
    const setting = 'fromSetting' in found.length ? ruleByKey(pack, found.length.fromSetting) : null
    const length = resolveRuleLength(found, EMPTY_FACTS, setting, undefined)
    return computeRuleDue(found, length, d(start), packHolidayCalendar()).due
  })
}

describe('Board of Appeals windows', () => {
  it('delivers the decision within 7 days of the vote', () => {
    expect(clockDue('me.boa.delivery_due', '2027-04-15')).toBe('2027-04-22')
    expect(rule('me.boa.delivery_due')).toMatchObject({
      clockType: 'action_due',
      startEvent: 'board_vote',
      citation: { label: '30-A MRSA §2691(3)(E)', url: SECTION_2691 },
    })
  })

  it('takes a reconsideration request within 10 days, rolling past a Sunday', () => {
    expect(clockDue('me.appeal.boa_reconsideration', '2027-04-15')).toBe('2027-04-26')
    expect(rule('me.appeal.boa_reconsideration')).toMatchObject({
      consequence: {
        text: 'A reconsideration request filed after this date is untimely (30-A MRSA §2691(3)(F)).',
      },
    })
  })

  it('takes a court appeal within 45 days, rolling past Memorial Day', () => {
    expect(clockDue('me.appeal.boa_court', '2027-04-15')).toBe('2027-06-01')
  })

  it('takes a court appeal within 15 days of the reconsideration vote', () => {
    expect(clockDue('me.appeal.boa_court_after_reconsideration', '2027-05-20')).toBe('2027-06-04')
    expect(rule('me.appeal.boa_court_after_reconsideration')).toMatchObject({
      startEvent: 'rehearing_vote',
    })
  })

  it('runs 30 days from the final approval or a denial for other board decisions', () => {
    expect(clockDue('me.appeal.board_court_final', '2027-05-12')).toBe('2027-06-11')
    expect(clockDue('me.appeal.boa_court_after_planning_board', '2027-04-28')).toBe('2027-05-28')
    expect(rule('me.appeal.boa_court_after_planning_board')).toMatchObject({
      startEvent: 'project_final_approval',
      onlyWhen: { fact: 'finalReviewBoard', in: ['planning_board'] },
      cancelledBy: 'rehearing_vote',
      citation: { label: '30-A MRSA §2691(3); §4482-A(1)', url: SECTION_2691 },
    })
    expect(clockDue('me.appeal.significant_final', '2027-05-12')).toBe('2027-06-11')
    expect(clockDue('me.appeal.board_court_denial', '2027-04-15')).toBe('2027-05-17')
    expect(clockDue('me.appeal.significant_denial', '2027-04-20')).toBe('2027-05-20')
    expect(rule('me.appeal.significant_denial')).toMatchObject({ startEvent: 'decision_filed' })
    expect(rule('me.appeal.significant_final').citation).toEqual({
      label: '30-A MRSA §4482(3); M.R. Civ. P. 80B(b)',
      url: 'https://www.courts.maine.gov/rules/text/mr_civ_p_only_2026-06-01.pdf',
    })
  })

  it('voids an unrecorded variance 90 days after the final written approval', () => {
    expect(clockDue('me.boa.final_written_approval', '2027-04-20')).toBe('2027-07-19')
    expect(rule('me.boa.final_written_approval')).toMatchObject({
      clockType: 'action_due',
      startEvent: 'final_written_approval',
      consequence: { kind: 'void_unless_recorded' },
      citation: { label: '30-A MRSA §4353(5)', url: SECTION_4353 },
    })
  })

  it('reads the administrative appeal period from the town, 30 days to start', () => {
    expect(clockDue('me.appeal.admin_to_boa', '2027-03-01')).toBe('2027-03-31')
    expect(rule('me.appeal.admin_to_boa')).toMatchObject({
      startEvent: 'administrative_decision',
      length: { unit: 'days', fromSetting: 'town.appeal.admin_to_boa_days' },
      consequence: { kind: 'appeal_untimely' },
    })
    expect(rule('town.appeal.admin_to_boa_days')).toMatchObject({
      overridePolicy: { policy: 'delegated_choice', default: 30 },
    })
  })

  it('starts each Planning Board denial window on its significance only', () => {
    const bound = new Set(classification('me.pb_subdivision').mandatoryRuleKeys)
    const started = (event: 'board_vote' | 'decision_filed', significantDecision: boolean) =>
      rulesForEvent(ME_PACK.manifest.rules, event, bound, {
        ...EMPTY_FACTS,
        outcome: 'denied',
        significantDecision,
      })
        .map((r) => r.key)
        .filter((k) => k.startsWith('me.appeal.'))
    expect(started('board_vote', true)).toEqual([])
    expect(started('decision_filed', true)).toEqual(['me.appeal.significant_denial'])
    expect(started('board_vote', false)).toEqual(['me.appeal.board_court_denial'])
    expect(started('decision_filed', false)).toEqual([])
  })
})

describe('Board of Appeals hearing notice', () => {
  const plan = (key: string) =>
    withPackForTest(ME_PACK, () => {
      const found = ruleByKey(loadPack(), key)
      if (found.kind !== 'notice_requirement') throw new Error(`${key} is not a requirement`)
      return planRequirement(found, {
        hearingDate: d('2027-04-15'),
        flags: { regionalImpact: false, desWithin: false, sourceWaterArea: null },
        townLeadDays: {},
        publicChoice: null,
        stage: 'before_hearing',
      })
    })

  it('mails the parties and the abutters 7 days before the hearing to start', () => {
    expect(plan('me.boa.notice.parties')).toMatchObject({
      channel: 'first_class_mail',
      dueOn: '2027-04-08',
      recipients: { roles: ['applicant', 'planning_board', 'municipal_officers'] },
    })
    expect(plan('town.boa.notice.abutters')).toMatchObject({
      channel: 'first_class_mail',
      dueOn: '2027-04-08',
      recipients: { roles: ['abutter_owner'] },
    })
    expect(rule('me.boa.notice.parties').citation).toEqual({
      label: '30-A MRSA §4353(3)',
      url: SECTION_4353,
    })
    expect(rule('town.boa.notice.abutters').citation).toEqual({ label: 'Town rule', url: null })
  })

  it('lists the planning board and the municipal officers as recipients', () => {
    for (const key of BOA_KEYS) {
      const spec = classification(key).abutters
      if (spec === null) throw new Error(`${key} has no abutter spec`)
      expect(spec).toMatchObject({
        strategyKey: 'me.adjacent_buffer.v1',
        resolverKey: 'me.recipients.v1',
      })
      const flags = { regionalImpact: false, desWithin: false, sourceWaterArea: null }
      expect(recipientRolesFor(spec, flags)).toEqual([
        'applicant',
        'abutter_owner',
        'planning_board',
        'municipal_officers',
      ])
    }
  })
})

describe('Board of Appeals classifications and roles', () => {
  it('records a variance but not an administrative appeal', () => {
    expect(classification('me.boa_variance')).toMatchObject({
      boardKind: 'zba',
      hearing: 'required',
      recordingRequired: true,
      noticeRequirementKeys: ['me.boa.notice.parties', 'town.boa.notice.abutters'],
    })
    expect(classification('me.boa_variance').mandatoryRuleKeys).toContain(
      'me.boa.final_written_approval',
    )
    expect(classification('me.boa_admin_appeal')).toMatchObject({
      boardKind: 'zba',
      hearing: 'required',
      recordingRequired: false,
    })
    expect(classification('me.boa_admin_appeal').mandatoryRuleKeys).not.toContain(
      'me.boa.final_written_approval',
    )
  })

  it('binds the court windows each board needs', () => {
    for (const key of BOA_KEYS) {
      expect(classification(key).mandatoryRuleKeys).toEqual(
        expect.arrayContaining([
          'me.boa.hearing_notice',
          'me.boa.delivery_due',
          'me.appeal.boa_reconsideration',
          'me.appeal.boa_court',
          'me.appeal.boa_court_after_reconsideration',
          'me.appeal.boa_court_after_planning_board',
        ]),
      )
      expect(classification(key).mandatoryRuleKeys).not.toContain('me.appeal.board_court_final')
    }
    for (const key of PB_KEYS) {
      expect(classification(key).mandatoryRuleKeys).toEqual(
        expect.arrayContaining([
          'me.appeal.board_court_final',
          'me.appeal.board_court_denial',
          'me.appeal.significant_final',
          'me.appeal.significant_denial',
        ]),
      )
    }
  })

  it('delivers a decision to four recipients by mail or by hand', () => {
    expect(rule('me.boa.delivery')).toMatchObject({
      kind: 'decision_delivery',
      boardKinds: ['zba'],
      recipients: ['applicant', 'agent', 'planning_board', 'municipal_officers'],
      methods: ['mail', 'hand'],
      dueRuleKey: 'me.boa.delivery_due',
    })
  })

  it('files both in the board of appeals series', () => {
    const series = ME_RECORD_SERIES_DEFAULTS.byClassification
    expect(series['me.boa_variance']).toBe('me.rs.board_of_appeals_files')
    expect(series['me.boa_admin_appeal']).toBe('me.rs.board_of_appeals_files')
  })

  it('names the Board of Appeals roles', () => {
    expect(ME_ROLES.rules).toMatchObject({
      adminAppealToZba: 'me.appeal.admin_to_boa',
      zbaHearing: null,
      zbaDecision: null,
      zbaExercise: null,
      writtenDecision: null,
      decisionFiling: null,
      appealSuspension: null,
    })
    expect(ME_ROLES.gates.varianceRecorded).toBe('me.boa.variance_recorded')
    expect(rule('me.boa.variance_recorded')).toMatchObject({
      kind: 'gate',
      appliesTo: ['issued', 'decided'],
    })
    expect(ME_ROLES.ruleGroups.board).toEqual(['me.pb.', 'me.boa.'])
    expect(ME_ROLES.ruleGroups.portalBoardDeadlines).toEqual(['me.appeal.'])
  })
})

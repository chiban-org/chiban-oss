import { describe, expect, it } from 'vitest'
import { recipientRolesFor } from '@/features/abutters/roles'
import { offersCertification } from '@/features/boards/certificationClock'
import { incompleteVoteDenies } from '@/features/boards/completenessVote'
import { computeRuleDue, resolveRuleLength } from '@/features/clocks/ruleEngine'
import { boardDecisionDeadlineKeys } from '@/features/decisions/decisionClocks'
import { planRequirement } from '@/features/notices/requirementPlan'
import { requirementsFor } from '@/features/notices/requirementsFor'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { withPackForTest } from '@/features/packs/registry'
import type { ProceedingClassification } from '@/features/packs/schema'
import type { CivilDate } from '@/types/civilDate'
import { ME_PACK } from './index'
import { ME_RECORD_SERIES_DEFAULTS } from './recordSeries'
import { ME_ROLES } from './roles'

const d = (s: string) => s as CivilDate
const SECTION_4403 = 'https://legislature.maine.gov/statutes/30-A/title30-Asec4403.html'
const EMPTY_FACTS = { classification: null, dwellingUnits: null, afterTheFact: false }

function classification(key: string): ProceedingClassification {
  const found = ME_PACK.manifest.classifications.find((c) => c.key === key)
  if (found === undefined) throw new Error(`no classification ${key}`)
  return found
}

function clockDue(key: string, start: string): string {
  return withPackForTest(ME_PACK, () => {
    const pack = loadPack()
    const rule = ruleByKey(pack, key)
    if (rule.kind !== 'clock') throw new Error(`${key} is not a clock`)
    const setting = 'fromSetting' in rule.length ? ruleByKey(pack, rule.length.fromSetting) : null
    const length = resolveRuleLength(rule, EMPTY_FACTS, setting, undefined)
    return computeRuleDue(rule, length, d(start), packHolidayCalendar()).due
  })
}

function noticeDue(key: string, anchor: string, stage: 'on_receipt' | 'before_hearing') {
  return withPackForTest(ME_PACK, () => {
    const rule = ruleByKey(loadPack(), key)
    if (rule.kind !== 'notice_requirement') throw new Error(`${key} is not a requirement`)
    return planRequirement(rule, {
      hearingDate: d(anchor),
      flags: { regionalImpact: false, desWithin: false, sourceWaterArea: true },
      townLeadDays: {},
      publicChoice: null,
      stage,
    })
  })
}

function clock(key: string) {
  const rule = ME_PACK.manifest.rules.find((r) => r.key === key)
  if (rule?.kind !== 'clock') throw new Error(`${key} is not a clock`)
  return rule
}

const flags = (sourceWaterArea: boolean | null) => ({
  regionalImpact: false,
  desWithin: false,
  sourceWaterArea,
})

describe('Planning Board due dates under 30-A MRSA §4403', () => {
  it('answers completeness within 30 days of receipt', () => {
    expect(clockDue('me.pb.completeness', '2027-03-02')).toBe('2027-04-01')
    expect(clock('me.pb.completeness')).toMatchObject({
      clockType: 'action_due',
      whose: 'board',
      startEvent: 'application_received',
      citation: { label: '30-A MRSA §4403(3)(B)', url: SECTION_4403 },
    })
  })

  it('mails the receipt notices within the town setting, 7 days to start', () => {
    expect(clockDue('me.pb.receipt_notice', '2027-03-02')).toBe('2027-03-09')
    expect(noticeDue('me.pb.notice.receipt_mail', '2027-03-02', 'on_receipt')).toMatchObject({
      channel: 'first_class_mail',
      dueOn: '2027-03-09',
    })
    expect(noticeDue('me.pb.notice.receipt_water', '2027-03-02', 'on_receipt')).toMatchObject({
      channel: 'first_class_mail',
      dueOn: '2027-03-09',
    })
  })

  it('holds an elected hearing within 30 days of completeness', () => {
    expect(clockDue('me.pb.hearing_window', '2027-03-24')).toBe('2027-04-23')
    expect(clock('me.pb.hearing_window')).toMatchObject({
      startEvent: 'application_accepted',
      onlyIfHearingScheduled: true,
      citation: { label: '30-A MRSA §4403(4)', url: SECTION_4403 },
    })
  })

  it('publishes twice and tells the applicant before the hearing', () => {
    expect(noticeDue('me.pb.notice.hearing_first', '2027-04-14', 'before_hearing')).toMatchObject({
      channel: 'newspaper',
      dueOn: '2027-04-07',
      recipients: { public: true },
    })
    expect(noticeDue('me.pb.notice.hearing_second', '2027-04-14', 'before_hearing')).toMatchObject({
      channel: 'newspaper',
      dueOn: '2027-04-13',
      recipients: { public: true },
    })
    expect(noticeDue('me.pb.notice.applicant', '2027-04-14', 'before_hearing')).toMatchObject({
      channel: 'first_class_mail',
      dueOn: '2027-04-07',
      recipients: { roles: ['applicant'] },
    })
    expect(clock('me.pb.hearing_notice_first')).toMatchObject({
      clockType: 'notice_lead',
      direction: 'before',
      startEvent: 'acceptance_meeting_set',
      overridePolicy: { policy: 'minimum', floor: 7 },
      citation: { label: '30-A MRSA §4403(4)(B)', url: SECTION_4403 },
    })
  })

  it('decides within 60 days of completeness, or 30 days after a hearing', () => {
    expect(clockDue('me.pb.decision_no_hearing', '2027-03-24')).toBe('2027-05-23')
    expect(clockDue('me.pb.decision_after_hearing', '2027-04-14')).toBe('2027-05-14')
    expect(clock('me.pb.decision_no_hearing')).toMatchObject({
      startEvent: 'application_accepted',
      cancelledBy: 'hearing_held',
      satisfiedByDecision: true,
      extension: { allowed: true, by: 'applicant_consent' },
      citation: { label: '30-A MRSA §4403(5)', url: SECTION_4403 },
    })
    expect(clock('me.pb.decision_after_hearing')).toMatchObject({
      startEvent: 'hearing_held',
      satisfiedByDecision: true,
      extension: { allowed: true, by: 'applicant_consent' },
    })
    expect(clock('me.pb.decision_no_hearing').consequence.text).toContain(
      'or within any other time limit that is otherwise mutually agreed to',
    )
  })

  it('decides a site plan within the town setting, 60 days to start', () => {
    expect(clockDue('town.sp.decision', '2027-03-24')).toBe('2027-05-23')
    expect(clock('town.sp.decision')).toMatchObject({
      startEvent: 'application_accepted',
      satisfiedByDecision: true,
      length: { unit: 'days', fromSetting: 'town.sp.decision_days' },
    })
    expect(withPackForTest(ME_PACK, () => boardDecisionDeadlineKeys())).toEqual(
      expect.arrayContaining([
        'me.pb.decision_no_hearing',
        'me.pb.decision_after_hearing',
        'town.sp.decision',
      ]),
    )
  })

  it('starts every town value as a delegated Chiban starting value', () => {
    const settings = {
      'town.pb.receipt_notice_days': 7,
      'town.pb.second_publication_days': 1,
      'town.pb.applicant_notice_days': 7,
      'town.sp.decision_days': 60,
      'town.sp.hearing_notice_days': 7,
    }
    for (const [key, value] of Object.entries(settings)) {
      const rule = ME_PACK.manifest.rules.find((r) => r.key === key)
      expect(rule).toMatchObject({
        kind: 'town_setting',
        unit: 'days',
        overridePolicy: { policy: 'delegated_choice', default: value },
        citation: { label: 'Town rule', url: null },
      })
      expect(rule?.label.endsWith('(Chiban starting value)')).toBe(true)
    }
  })
})

describe('the subdivision receipt set', () => {
  const subdivision = () => classification('me.pb_subdivision')

  it('derives on receipt for the abutters, the clerk and the reviewing authority', () => {
    const receipt = withPackForTest(ME_PACK, () =>
      requirementsFor(subdivision(), flags(null), 'on_receipt'),
    )
    expect(receipt.map((r) => r.key)).toEqual(['me.pb.notice.receipt_mail'])
    expect(receipt[0]).toMatchObject({
      stage: 'on_receipt',
      channel: 'first_class_mail',
      leadRuleKey: 'me.pb.receipt_notice',
      recipients: { roles: ['abutter_owner', 'municipal_clerk', 'municipal_reviewing_authority'] },
      citation: { label: '30-A MRSA §4403(3)(A)', url: SECTION_4403 },
    })
  })

  it('adds the water supplier only after a within determination', () => {
    const keys = (sourceWaterArea: boolean | null) =>
      withPackForTest(ME_PACK, () =>
        requirementsFor(subdivision(), flags(sourceWaterArea), 'on_receipt').map((r) => r.key),
      )
    expect(keys(false)).toEqual(['me.pb.notice.receipt_mail'])
    expect(keys(true)).toEqual(['me.pb.notice.receipt_mail', 'me.pb.notice.receipt_water'])
    const abutters = subdivision().abutters
    if (abutters === null) throw new Error('no abutters')
    expect(recipientRolesFor(abutters, flags(false))).not.toContain('water_supplier')
    expect(recipientRolesFor(abutters, flags(true))).toContain('water_supplier')
  })

  it('leaves the hearing notices for a scheduled hearing', () => {
    const hearing = withPackForTest(ME_PACK, () =>
      requirementsFor(subdivision(), flags(false), 'before_hearing').map((r) => r.key),
    )
    expect(hearing).toEqual([
      'me.pb.notice.hearing_first',
      'me.pb.notice.hearing_second',
      'me.pb.notice.applicant',
    ])
  })
})

describe('the Planning Board classifications', () => {
  it.each(['me.pb_subdivision', 'me.pb_site_plan'])('%s has an optional hearing', (key) => {
    expect(classification(key)).toMatchObject({
      boardKind: 'planning_board',
      hearing: 'optional',
      significanceApplies: true,
      directIssueAllowed: false,
      requiredSubsteps: [],
      abutters: { strategyKey: 'me.adjacent_buffer.v1', resolverKey: 'me.recipients.v1' },
    })
  })

  it('notices the subdivision receipt recipients but not on a site plan', () => {
    expect(classification('me.pb_subdivision').abutters).toMatchObject({
      roles: ['applicant', 'abutter_owner', 'municipal_clerk', 'municipal_reviewing_authority'],
      conditionalRoles: [{ role: 'water_supplier', when: 'source_water_area' }],
    })
    expect(classification('me.pb_site_plan')).toMatchObject({
      abutters: { roles: ['applicant', 'abutter_owner'], conditionalRoles: [] },
      noticeRequirementKeys: ['town.sp.notice.hearing', 'town.sp.notice.abutters'],
      mandatoryRuleKeys: [
        'town.sp.decision_days',
        'town.sp.decision',
        'town.sp.hearing_notice_days',
        'town.sp.hearing_notice',
        'me.appeal.board_court_final',
        'me.appeal.board_court_denial',
        'me.appeal.significant_final',
        'me.appeal.significant_denial',
      ],
    })
  })

  it('files each in its retention series', () => {
    expect(ME_RECORD_SERIES_DEFAULTS.byClassification['me.pb_subdivision']).toBe(
      'me.rs.subdivision_permits',
    )
    expect(ME_RECORD_SERIES_DEFAULTS.byClassification['me.pb_site_plan']).toBe(
      'me.rs.site_plans_approved',
    )
  })

  it('names the Planning Board roles', () => {
    expect(ME_ROLES.rules.planningBoardCompleteness).toBe('me.pb.completeness')
    expect(ME_ROLES.rules.planningBoardDecision).toBe('me.pb.decision_no_hearing')
    expect(ME_ROLES.ruleGroups.board).toEqual(['me.pb.', 'me.boa.'])
  })
})

describe('board follow-up that only the NH pack models', () => {
  it('offers selectmen certification only for an NH decision clock', () => {
    expect(offersCertification({ ruleKey: 'nh.pb.decision', ruleVersion: 1 })).toBe(true)
    expect(
      withPackForTest(ME_PACK, () =>
        offersCertification({ ruleKey: 'me.pb.decision_no_hearing', ruleVersion: 1 }),
      ),
    ).toBe(false)
  })

  it('closes an incomplete application at the vote only under the NH pack', () => {
    expect(incompleteVoteDenies()).toBe(true)
    expect(withPackForTest(ME_PACK, () => incompleteVoteDenies())).toBe(false)
  })
})

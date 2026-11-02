import type {
  ClockRule,
  DecisionOutcome,
  NoticeRequirementRule,
  ProceedingClassification,
  RecordRule,
} from '@packs/nh/schema'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { rulesForEvent } from '@/features/clocks/ruleEngine'
import { appealRightsOf } from '@/features/decisions/appealRights'
import { requiredDecisionFields } from '@/features/decisions/requiredFields'
import type { ProjectFacts } from '@/features/forms/validateSubmission'
import { planRequirement, type RequirementFlags } from '@/features/notices/requirementPlan'
import { requirementsFor } from '@/features/notices/requirementsFor'
import { ALL_POLICY_FIELDS } from '@/features/packs/probes/clockProbes'
import {
  classificationOf,
  clockRule,
  type FieldProbe,
  packRule,
  probe,
} from '@/features/packs/probes/probe'
import { observeRule, ruleProbes } from '@/features/packs/probes/ruleProbes'
import { validateWorkflow } from '@/features/workflow/validateWorkflow'
import type { CivilDate } from '@/types/civilDate'

const ZBA_MAIL = 'nh.zba.notice_req.mail'
const d = (s: string) => s as CivilDate
const OUTCOMES: DecisionOutcome[] = [
  'approved',
  'approved_with_conditions',
  'denied',
  'rehearing_granted',
  'rehearing_denied',
]
const FLAG_SETS: RequirementFlags[] = [
  { regionalImpact: false, desWithin: false },
  { regionalImpact: true, desWithin: false },
  { regionalImpact: false, desWithin: true },
]
const CHOICES = [null, 'public_posting', 'newspaper'] as const

function noticeRule(key: string): NoticeRequirementRule {
  const rule = packRule(key)
  if (rule.kind !== 'notice_requirement') throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, 'shape')
  return rule
}

function recordRule(): RecordRule {
  const rule = packRule('nh.board.written_decision')
  if (rule.kind !== 'required_record') throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, 'shape')
  return rule
}

function observeNotice(rule: NoticeRequirementRule, original: NoticeRequirementRule): unknown {
  return {
    generic: observeRule(rule, original),
    plans: FLAG_SETS.flatMap((flags) =>
      CHOICES.flatMap((publicChoice) =>
        [{}, { [rule.leadRuleKey]: 21 }].map((townLeadDays) =>
          planRequirement(rule, {
            hearingDate: d('2027-04-14'),
            flags,
            townLeadDays,
            publicChoice,
          }),
        ),
      ),
    ),
  }
}

function noticeProbe(baseKey: string, mutate: (r: NoticeRequirementRule) => NoticeRequirementRule) {
  return probe<NoticeRequirementRule>({
    base: () => noticeRule(baseKey),
    mutate,
    observe: observeNotice,
  })
}

const FACT_VARIANTS = [
  {},
  { regionalImpact: true },
  { decisionFiledLate: true },
  { dwellingUnits: 3 },
  ...OUTCOMES.map((outcome) => ({ outcome })),
]

function gatedProbe(baseKey: string, mutate: (r: ClockRule) => ClockRule): FieldProbe {
  return probe<ClockRule>({
    base: () => clockRule(baseKey),
    mutate,
    observe: (rule, original) => ({
      generic: observeRule(rule, original),
      started: FACT_VARIANTS.map(
        (extra) =>
          rulesStarted(rule, {
            classification: null,
            dwellingUnits: null,
            afterTheFact: false,
            ...extra,
          }).length,
      ),
    }),
  })
}

function rulesStarted(rule: ClockRule, facts: ProjectFacts): ClockRule[] {
  return rulesForEvent([rule], rule.startEvent, new Set([rule.key]), facts)
}

const SAMPLE_WORKFLOWS = [
  { allowsDirectIssue: false, substeps: [], closesOn: 'staff_closes' as const },
  { allowsDirectIssue: true, substeps: [], closesOn: 'staff_closes' as const },
  {
    allowsDirectIssue: false,
    substeps: [
      { state: 'submitted' as const, key: 'filed', label: 'Filed' },
      { state: 'under_review' as const, key: 'hearing', label: 'Hearing' },
    ],
    closesOn: 'staff_closes' as const,
  },
  {
    allowsDirectIssue: false,
    substeps: [{ state: 'decided' as const, key: 'filed', label: 'Filed' }],
    closesOn: 'staff_closes' as const,
  },
]

function observeClassification(c: ProceedingClassification): unknown {
  return {
    notices: FLAG_SETS.map((flags) => requirementsFor(c, flags).map((r) => r.key)),
    workflows: SAMPLE_WORKFLOWS.map((w) => validateWorkflow(w, c)),
    appealRights: appealRightsOf(c),
  }
}

function classProbe(
  key: string,
  mutate: (c: ProceedingClassification) => ProceedingClassification,
): FieldProbe {
  return probe<ProceedingClassification>({
    base: () => classificationOf(key),
    mutate,
    observe: observeClassification,
  })
}

export function decisionProbes(): Record<string, FieldProbe> {
  return {
    'clock.onlyWhen.fact': gatedProbe('nh.ri.transmittal', (r) => ({
      ...r,
      onlyWhen: { fact: 'decisionFiledLate', is: true },
    })),
    'clock.onlyWhen.is': gatedProbe('nh.ri.transmittal', (r) => ({
      ...r,
      onlyWhen: { fact: 'regionalImpact', is: false as never },
    })),
    'clock.onlyWhen.in': gatedProbe('nh.appeal.zba_court', (r) => ({
      ...r,
      onlyWhen: { fact: 'outcome', in: ['approved'] },
    })),
    'clock.onlyWhen.gt': gatedProbe('nh.ri.transmittal', (r) => ({
      ...r,
      onlyWhen: { fact: 'dwellingUnits', gt: 0 },
    })),
    'required_record.conditionalFields.field': probe<RecordRule>({
      base: recordRule,
      mutate: (r) => ({
        ...r,
        conditionalFields: r.conditionalFields?.map((c, i) =>
          i === 0 ? { ...c, field: 'findings' } : c,
        ),
      }),
      observe: (r) => OUTCOMES.map((o) => requiredDecisionFields(r, o)),
    }),
    'required_record.conditionalFields.outcomes': probe<RecordRule>({
      base: recordRule,
      mutate: (r) => ({
        ...r,
        conditionalFields: r.conditionalFields?.map((c, i) =>
          i === 0 ? { ...c, outcomes: ['denied' as const] } : c,
        ),
      }),
      observe: (r) => OUTCOMES.map((o) => requiredDecisionFields(r, o)),
    }),
    ...ruleProbes('notice_requirement', 'nh.pb.notice_req.public', ALL_POLICY_FIELDS),
    'notice_requirement.channel': noticeProbe(ZBA_MAIL, (r) => ({
      ...r,
      channel: 'first_class_mail',
    })),
    'notice_requirement.channel.townChoice': noticeProbe('nh.pb.notice_req.public', (r) => ({
      ...r,
      channel: { townChoice: ['newspaper', 'public_posting'] },
    })),
    'notice_requirement.recipients.roles': noticeProbe(ZBA_MAIL, (r) => ({
      ...r,
      recipients: { roles: ['applicant'] },
    })),
    'notice_requirement.recipients.public': noticeProbe(ZBA_MAIL, (r) => ({
      ...r,
      recipients: { public: true },
    })),
    'notice_requirement.leadRuleKey': noticeProbe(ZBA_MAIL, (r) => ({
      ...r,
      leadRuleKey: 'nh.pb.notice.mail',
    })),
    'notice_requirement.onlyWhen': noticeProbe(ZBA_MAIL, (r) => ({
      ...r,
      onlyWhen: 'regional_impact_yes',
    })),
    'classification.noticeRequirementKeys': classProbe('nh.pb_site_plan', (c) => ({
      ...c,
      noticeRequirementKeys: c.noticeRequirementKeys.slice(1),
    })),
    'classification.requiredSubsteps.state': classProbe('nh.zba_variance', (c) => ({
      ...c,
      requiredSubsteps: c.requiredSubsteps.map((s) => ({ ...s, state: 'decided' as const })),
    })),
    'classification.requiredSubsteps.key': classProbe('nh.zba_variance', (c) => ({
      ...c,
      requiredSubsteps: c.requiredSubsteps.map((s) => ({ ...s, key: 'filed' })),
    })),
    'classification.directIssueAllowed': classProbe('nh.pb_site_plan', (c) => ({
      ...c,
      directIssueAllowed: true,
    })),
    'classification.appealRights': probe<ProceedingClassification>({
      base: () => classificationOf('nh.zba_variance'),
      mutate: (c) => ({ ...c, appealRights: 'Changed copy' }),
      observe: appealRightsOf,
    }),
  }
}

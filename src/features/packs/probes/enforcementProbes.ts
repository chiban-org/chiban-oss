import type { CeaseAndDesistRule, CivilPenaltyRule, RecipientRole } from '@packs/nh/schema'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { finesNeedJudgment } from '@/features/enforcement/fines'
import { motionBlocks } from '@/features/enforcement/motionGate'
import { missingOrderContent } from '@/features/enforcement/orderPdf'
import { issuerAuthorized } from '@/features/enforcement/orders'
import { penaltyExposure } from '@/features/enforcement/penaltyExposure'
import { enforcementRulesFor } from '@/features/enforcement/ruleLinks'
import { serverRoleAllowed } from '@/features/enforcement/serviceEvents'
import {
  type ServiceCheck,
  type ServiceEvent,
  type ServiceRecipient,
  serviceStatus,
} from '@/features/enforcement/serviceStatus'
import { NOT_STAYED } from '@/features/enforcement/stay'
import type { CivilDate } from '@/types/civilDate'
import { attempt, type FieldProbe, packRule, probe } from './probe'
import { observeRule, ruleProbes } from './ruleProbes'

const d = (s: string) => s as CivilDate
const ZONING = 'nh.enf.cd_zoning'
const PENALTY = 'nh.enf.penalty_zoning'
const ALL_ROLES: RecipientRole[] = [
  'record_owner',
  'owner_agent',
  'taxpayer',
  'occupying_tenant',
  'person_in_control',
  'mortgagee_of_record',
]
const SERVER_ROLES = [
  'sheriff',
  'deputy_sheriff',
  'local_police_officer',
  'constable',
  'other',
] as const

const insertion = (on: string): ServiceEvent => ({
  id: `i-${on}`,
  recipientId: null,
  method: 'newspaper_publication',
  servedOn: d(on),
})
const posting = (on: string): ServiceEvent => ({
  id: `p-${on}`,
  recipientId: null,
  method: 'posting_on_property',
  servedOn: d(on),
})
const weekly = ['2027-03-04', '2027-03-11', '2027-03-18', '2027-03-25'].map(insertion)
const ownerNotFound: ServiceCheck = { role: 'record_owner', outcome: 'owner_not_found' }
const owner: ServiceRecipient = { id: 'owner', role: 'record_owner' }
const agent: ServiceRecipient = { id: 'agent', role: 'owner_agent' }
const served = (recipientId: string): ServiceEvent => ({
  id: `s-${recipientId}`,
  recipientId,
  method: 'in_hand',
  servedOn: d('2027-03-01'),
})
const noneForOthers: ServiceCheck[] = ALL_ROLES.filter(
  (r) => r !== 'record_owner' && r !== 'owner_agent',
).map((role) => ({ role, outcome: role === 'taxpayer' ? 'same_as_owner' : 'none_exist' }))

function observeCd(rule: CeaseAndDesistRule): unknown {
  const links = attempt(() => enforcementRulesFor(rule))
  const blocksOn = (filed: string, today: string) =>
    motionBlocks({
      rule,
      status: { complete: true, servedOn: {}, fallbackCompletedOn: null, missing: [] },
      recipients: [],
      filedWithClerkOn: d(filed),
      stay: NOT_STAYED,
      today: d(today),
    })
  return {
    generic: observeRule(rule, rule),
    links:
      links === 'throws' ? links : [links.answer.key, links.judgmentAppeal.key, links.penalty.key],
    empty: serviceStatus(rule, { checks: [], recipients: [], events: [] }),
    ownerOnly: serviceStatus(rule, {
      checks: noneForOthers,
      recipients: [owner],
      events: [served('owner')],
    }),
    agentOnly: serviceStatus(rule, {
      checks: noneForOthers,
      recipients: [agent],
      events: [served('agent')],
    }),
    fallback: serviceStatus(rule, {
      checks: [ownerNotFound, ...noneForOthers],
      recipients: [owner],
      events: [posting('2027-03-02'), ...weekly],
    }),
    unposted: serviceStatus(rule, {
      checks: [ownerNotFound, ...noneForOthers],
      recipients: [owner],
      events: weekly,
    }),
    threeWeeks: serviceStatus(rule, {
      checks: [ownerNotFound, ...noneForOthers],
      recipients: [owner],
      events: [posting('2027-03-02'), ...weekly.slice(0, 3)],
    }),
    servers: SERVER_ROLES.map((role) => serverRoleAllowed(rule, role)),
    content: missingOrderContent(rule, {
      findings: [],
      correctiveAction: '',
      correctiveDeadline: null,
    }),
    designated: [issuerAuthorized(rule, true), issuerAuthorized(rule, false)],
    lead: [blocksOn('2027-04-01', '2027-04-05'), blocksOn('2027-04-01', '2027-04-10')],
  }
}

function cdProbe(mutate: (r: CeaseAndDesistRule) => CeaseAndDesistRule): FieldProbe {
  return probe<CeaseAndDesistRule>({
    base: () => cdRule(),
    mutate,
    observe: (rule) => observeCd(rule),
  })
}

function cdRule(): CeaseAndDesistRule {
  const rule = packRule(ZONING)
  if (rule.kind !== 'cease_and_desist') throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, 'shape')
  return rule
}

function penaltyRule(): CivilPenaltyRule {
  const rule = packRule(PENALTY)
  if (rule.kind !== 'civil_penalty') throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, 'shape')
  return rule
}

function observePenalty(rule: CivilPenaltyRule): unknown {
  const through = d('2027-02-20')
  const run = (offense: 'first' | 'subsequent') =>
    attempt(() =>
      penaltyExposure(rule, {
        noticeReceivedOn: d('2027-02-10'),
        convictedOn: d('2027-02-05'),
        through,
        offense,
      }),
    )
  return {
    generic: observeRule(rule, rule),
    first: run('first'),
    subsequent: run('subsequent'),
    needsJudgment: finesNeedJudgment(rule),
  }
}

function penaltyProbe(mutate: (r: CivilPenaltyRule) => CivilPenaltyRule): FieldProbe {
  return probe<CivilPenaltyRule>({ base: penaltyRule, mutate, observe: observePenalty })
}

export function enforcementProbes(): Record<string, FieldProbe> {
  return {
    ...ruleProbes('cease_and_desist', ZONING, ['policy']),
    ...ruleProbes('civil_penalty', PENALTY, ['policy']),
    'cease_and_desist.contentFields': cdProbe((r) => ({
      ...r,
      contentFields: r.contentFields.filter((f) => f !== 'facts'),
    })),
    'cease_and_desist.issuerMustBeDesignated': cdProbe((r) => ({
      ...r,
      issuerMustBeDesignated: false,
    })),
    'cease_and_desist.recipientRoles': cdProbe((r) => ({
      ...r,
      recipientRoles: r.recipientRoles.filter((x) => x !== 'mortgagee_of_record'),
    })),
    'cease_and_desist.ownerRoles': cdProbe((r) => ({ ...r, ownerRoles: ['record_owner'] })),
    'cease_and_desist.personalServerRoles': cdProbe((r) => ({
      ...r,
      personalServerRoles: ['sheriff'],
    })),
    'cease_and_desist.ownerNotFoundFallback.posting': cdProbe((r) => ({
      ...r,
      ownerNotFoundFallback: { ...r.ownerNotFoundFallback, posting: false },
    })),
    'cease_and_desist.ownerNotFoundFallback.publicationWeeks': cdProbe((r) => ({
      ...r,
      ownerNotFoundFallback: { ...r.ownerNotFoundFallback, publicationWeeks: 3 },
    })),
    'cease_and_desist.answerRuleKey': cdProbe((r) => ({
      ...r,
      answerRuleKey: 'nh.enf.answer_building',
    })),
    'cease_and_desist.courtFilingLeadDays': cdProbe((r) => ({ ...r, courtFilingLeadDays: 10 })),
    'cease_and_desist.judgmentAppealRuleKey': cdProbe((r) => ({
      ...r,
      judgmentAppealRuleKey: 'nh.enf.judgment_appeal_building',
    })),
    'cease_and_desist.penaltyRuleKey': cdProbe((r) => ({
      ...r,
      penaltyRuleKey: 'nh.enf.penalty_building',
    })),
    'civil_penalty.firstOffenseCentsPerDay': penaltyProbe((r) => ({
      ...r,
      firstOffenseCentsPerDay: 1000,
    })),
    'civil_penalty.subsequentCentsPerDay': penaltyProbe((r) => ({
      ...r,
      subsequentCentsPerDay: 2000,
    })),
    'civil_penalty.accrual': penaltyProbe((r) => ({ ...r, accrual: 'other' as never })),
    'civil_penalty.imposedBy': penaltyProbe((r) => ({ ...r, imposedBy: 'other' as never })),
  }
}

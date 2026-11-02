import type { CeaseAndDesistRule, CivilPenaltyRule, ClockRule, PackRule } from '@packs/nh/schema'
import { ORDER_CONTENT_FIELDS, PERSONAL_SERVER_ROLES, RECIPIENT_ROLES } from '@packs/nh/schema'

const RSA_676_17A = 'https://gc.nh.gov/rsa/html/LXIV/676/676-17-a.htm'
const RSA_155A_8B = 'https://gc.nh.gov/rsa/html/XII/155-A/155-A-8-b.htm'
const RSA_676_17 = 'https://gc.nh.gov/rsa/html/LXIV/676/676-17.htm'
const RSA_155A_8A = 'https://gc.nh.gov/rsa/html/XII/155-A/155-A-8-a.htm'
const RSA_676_6 = 'https://gc.nh.gov/rsa/html/LXIV/676/676-6.htm'

const ANSWER_CONSEQUENCE =
  'If no answer is served, the enforcement official may move the district court to enforce the order.'
const APPEAL_CONSEQUENCE =
  'After this date the district court judgment can no longer be appealed to the superior court.'

function ceaseAndDesist(
  suffix: 'zoning' | 'building',
  label: string,
  citation: { label: string; url: string },
): CeaseAndDesistRule {
  return {
    kind: 'cease_and_desist',
    key: `nh.enf.cd_${suffix}`,
    version: 1,
    label,
    citation,
    contentFields: [...ORDER_CONTENT_FIELDS],
    issuerMustBeDesignated: true,
    recipientRoles: [...RECIPIENT_ROLES],
    ownerRoles: ['record_owner', 'owner_agent'],
    personalServerRoles: [...PERSONAL_SERVER_ROLES],
    ownerNotFoundFallback: { posting: true, publicationWeeks: 4 },
    answerRuleKey: `nh.enf.answer_${suffix}`,
    courtFilingLeadDays: 5,
    judgmentAppealRuleKey: `nh.enf.judgment_appeal_${suffix}`,
    penaltyRuleKey: `nh.enf.penalty_${suffix}`,
    overridePolicy: { policy: 'fixed' },
  }
}

function answerClock(
  suffix: 'zoning' | 'building',
  citation: { label: string; url: string },
): ClockRule {
  return {
    kind: 'clock',
    key: `nh.enf.answer_${suffix}`,
    version: 1,
    label: 'Answer to a cease and desist order',
    citation,
    clockType: 'filing_window',
    whose: 'third_party',
    startEvent: 'order_served',
    length: { unit: 'days', value: 20 },
    direction: 'after',
    consequence: { kind: 'enforcement_step_opens', text: ANSWER_CONSEQUENCE },
    extension: { allowed: false, note: 'The statute provides no extension.' },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  }
}

function judgmentAppealClock(
  suffix: 'zoning' | 'building',
  citation: { label: string; url: string },
): ClockRule {
  return {
    kind: 'clock',
    key: `nh.enf.judgment_appeal_${suffix}`,
    version: 1,
    label: 'Appeal of a district court enforcement judgment',
    citation,
    clockType: 'filing_window',
    whose: 'third_party',
    startEvent: 'judgment_entered',
    length: { unit: 'days', value: 15 },
    direction: 'after',
    consequence: { kind: 'enforcement_step_opens', text: APPEAL_CONSEQUENCE },
    extension: { allowed: false, note: 'The statute provides no extension.' },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  }
}

function penalty(
  suffix: 'zoning' | 'building',
  label: string,
  citation: { label: string; url: string },
): CivilPenaltyRule {
  return {
    kind: 'civil_penalty',
    key: `nh.enf.penalty_${suffix}`,
    version: 1,
    label,
    citation,
    firstOffenseCentsPerDay: 27500,
    subsequentCentsPerDay: 55000,
    accrual: 'after_earlier_of_conviction_or_written_notice',
    imposedBy: 'court',
    overridePolicy: { policy: 'fixed' },
  }
}

export const ENFORCEMENT_RULES: PackRule[] = [
  ceaseAndDesist('zoning', 'Cease and desist order for a land use violation', {
    label: 'RSA 676:17-a',
    url: RSA_676_17A,
  }),
  ceaseAndDesist('building', 'Cease and desist order for a building code violation', {
    label: 'RSA 155-A:8-b',
    url: RSA_155A_8B,
  }),
  answerClock('zoning', { label: 'RSA 676:17-a V', url: RSA_676_17A }),
  answerClock('building', { label: 'RSA 155-A:8-b V', url: RSA_155A_8B }),
  judgmentAppealClock('zoning', { label: 'RSA 676:17-a X', url: RSA_676_17A }),
  judgmentAppealClock('building', { label: 'RSA 155-A:8-b X', url: RSA_155A_8B }),
  penalty('zoning', 'Civil penalty for a land use violation', {
    label: 'RSA 676:17 I',
    url: RSA_676_17,
  }),
  penalty('building', 'Civil penalty for a building code violation', {
    label: 'RSA 155-A:8-a',
    url: RSA_155A_8A,
  }),
  {
    kind: 'effect',
    key: 'nh.appeal.enforcement_stay',
    version: 1,
    label: 'Enforcement stayed by appeal (RSA 676:6)',
    citation: { label: 'RSA 676:6', url: RSA_676_6 },
    effect: 'stay_enforcement_on_appeal',
    overridePolicy: { policy: 'fixed' },
  },
]

import type { PackRule } from '@/features/packs/schema'
import {
  ORDER_CONTENT_FIELDS,
  PERSONAL_SERVER_ROLES,
  RECIPIENT_ROLES,
} from '@/features/packs/schema'

const ENFORCEMENT_ACT = 'https://laws.example/vellmora/enforcement-act'

function order(key: string, label: string): PackRule {
  return {
    kind: 'cease_and_desist',
    key,
    version: 1,
    label,
    citation: { label: 'Vellmora Enforcement Act 3', url: ENFORCEMENT_ACT },
    contentFields: [...ORDER_CONTENT_FIELDS],
    issuerMustBeDesignated: false,
    recipientRoles: [...RECIPIENT_ROLES],
    ownerRoles: ['record_owner'],
    personalServerRoles: [...PERSONAL_SERVER_ROLES],
    ownerNotFoundFallback: { posting: true, publicationWeeks: 2 },
    answerRuleKey: 'xx.enf.answer',
    courtFilingLeadDays: 3,
    judgmentAppealRuleKey: 'xx.enf.answer',
    penaltyRuleKey: 'xx.enf.penalty',
    overridePolicy: { policy: 'fixed' },
  }
}

export const XX_ENFORCEMENT_RULES: PackRule[] = [
  order('xx.enf.order_zoning', 'Zoning order to stop'),
  order('xx.enf.order_building', 'Building code order to stop'),
  {
    kind: 'clock',
    key: 'xx.enf.answer',
    version: 1,
    label: 'Answer to an order',
    citation: { label: 'Vellmora Enforcement Act 4', url: ENFORCEMENT_ACT },
    clockType: 'filing_window',
    whose: 'third_party',
    startEvent: 'order_served',
    length: { unit: 'days', value: 15 },
    direction: 'after',
    consequence: { kind: 'none_stated', text: 'The order stands.' },
    extension: { allowed: false, note: 'The act provides no extension.' },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'civil_penalty',
    key: 'xx.enf.penalty',
    version: 1,
    label: 'Daily penalty',
    citation: { label: 'Vellmora Enforcement Act 5', url: ENFORCEMENT_ACT },
    firstOffenseCentsPerDay: 5000,
    subsequentCentsPerDay: 10000,
    accrual: 'after_earlier_of_conviction_or_written_notice',
    imposedBy: 'court',
    overridePolicy: { policy: 'fixed' },
  },
]

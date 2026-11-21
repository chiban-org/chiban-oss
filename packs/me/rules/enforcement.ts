import { ME_URLS } from '@packs/me/rules/urls'
import type { PackRule } from '@/features/packs/schema'

export const ME_PENALTY_KEY = 'me.enf.penalty'
export const ME_CURE_RULE_KEY = 'me.enf.cure'
export const ME_CURE_CLOCK_KEY = 'me.enf.cure_period'

const SECTION_4452 = ME_URLS.title30Asec4452

export const ENFORCEMENT_RULES: PackRule[] = [
  {
    kind: 'civil_penalty',
    key: ME_PENALTY_KEY,
    version: 1,
    label: 'Civil penalty for a land use violation',
    citation: { label: '30-A MRSA §4452(3)', url: SECTION_4452 },
    model: 'range_daily',
    categories: [
      {
        key: 'no_permit',
        label: 'Work or land use without a required permit',
        minCentsPerDay: 10000,
        maxCentsPerDay: 250000,
      },
      {
        key: 'specific_violation',
        label: 'Specific violation',
        minCentsPerDay: 10000,
        maxCentsPerDay: 500000,
      },
      {
        key: 'resource_protection',
        label: 'Shoreland violation in a resource protection zone',
        minCentsPerDay: 10000,
        maxCentsPerDay: 1000000,
      },
    ],
    aggravations: [
      {
        key: 'prior_conviction',
        label: 'Prior conviction within 2 years',
        maxCentsPerDay: 2500000,
      },
      {
        key: 'economic_benefit',
        label: 'Economic benefit',
        maxMultipleOfBenefit: 2,
      },
    ],
    accrual: null,
    imposedBy: 'court',
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'clock',
    key: ME_CURE_CLOCK_KEY,
    version: 1,
    label: 'Time to cure a shoreland violation',
    citation: { label: '30-A MRSA §4452(1-A)', url: SECTION_4452 },
    clockType: 'action_due',
    whose: 'third_party',
    startEvent: 'cure_notice_sent',
    length: { unit: 'days', value: 10 },
    direction: 'after',
    consequence: {
      kind: 'enforcement_step_opens',
      text: 'If the violation is not corrected within 10 days, the municipality may deny, suspend or revoke permits for further development of the land until the violation is corrected and the penalties and costs are paid, and may file a civil action.',
    },
    extension: { allowed: false, note: '30-A MRSA §4452(1-A) provides no extension.' },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'cure_notice',
    key: ME_CURE_RULE_KEY,
    version: 1,
    label: 'Shoreland cure notice',
    citation: { label: '30-A MRSA §4452(1-A)', url: SECTION_4452 },
    occupant: 'if_applicable',
    method: 'certified_mail_return_receipt',
    cureRuleKey: ME_CURE_CLOCK_KEY,
    penaltyRuleKey: ME_PENALTY_KEY,
    remedies: { developmentHold: true, civilAction: true },
    overridePolicy: { policy: 'fixed' },
  },
]

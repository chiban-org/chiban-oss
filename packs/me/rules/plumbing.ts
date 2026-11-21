import { ME_URLS } from '@packs/me/rules/urls'
import type { PackRule } from '@/features/packs/schema'

const SECTION_4215 = { label: '30-A MRSA §4215(1)', url: ME_URLS.title30Asec4215 } as const
const CHAPTER_241 = {
  label: '10-144 CMR ch 241 §4.B.6',
  url: ME_URLS.subsurfaceWastewaterRule,
} as const
const CHAPTER_241_COMPLETENESS = {
  label: '10-144 CMR ch 241 §4.B.1',
  url: ME_URLS.subsurfaceWastewaterRule,
} as const

export const PLUMBING_RULES: PackRule[] = [
  {
    kind: 'clock',
    key: 'me.plumbing.validity',
    version: 1,
    label: 'Work must begin within 24 months',
    citation: {
      label: `${SECTION_4215.label} and ${CHAPTER_241.label}`,
      url: ME_URLS.title30Asec4215,
    },
    clockType: 'exercise_by',
    whose: 'applicant',
    startEvent: 'permit_issued',
    length: { unit: 'months', value: 24 },
    direction: 'after',
    consequence: { kind: 'lapse', text: 'The permit lapses unless work has commenced.' },
    extension: { allowed: false, note: 'The statute provides no extension.' },
    waivable: false,
    satisfiedByInspection: true,
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'clock',
    key: 'me.ssw.completeness',
    version: 1,
    label: 'Subsurface wastewater application completeness notice',
    citation: CHAPTER_241_COMPLETENESS,
    clockType: 'action_due',
    whose: 'official',
    startEvent: 'application_received',
    length: { unit: 'days', value: 14 },
    direction: 'after',
    consequence: {
      kind: 'none_stated',
      text: 'The rule requires the inspector to reject an incomplete application in writing within 14 days of receipt and states no consequence for missing that date.',
    },
    extension: { allowed: false, note: 'The rule provides no extension.' },
    waivable: false,
    satisfiedByCompletion: true,
    overridePolicy: { policy: 'fixed' },
  },
]

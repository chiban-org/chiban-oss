import { RSA_36_57_URL } from '@packs/nh/rules/boardUrls'
import type { PackRule } from '@packs/nh/schema'

export const REGIONAL_IMPACT_BOARD_RULES: PackRule[] = [
  {
    kind: 'gate',
    key: 'nh.ri.determination',
    version: 1,
    label: 'Regional impact determination recorded',
    citation: { label: 'RSA 36:57 I', url: RSA_36_57_URL },
    gateKind: 'statutory',
    appliesTo: ['under_review'],
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'clock',
    key: 'nh.ri.notice.certified',
    version: 1,
    label: 'Regional impact certified notice',
    citation: { label: 'RSA 36:57 III', url: RSA_36_57_URL },
    clockType: 'notice_lead',
    whose: 'board',
    startEvent: 'acceptance_meeting_set',
    length: { unit: 'days', value: 14 },
    direction: 'before',
    consequence: {
      kind: 'notice_defective',
      text: 'Certified notice later than this does not meet RSA 36:57 III.',
    },
    extension: { allowed: false, note: 'RSA 36:57 III sets the minimum notice period.' },
    waivable: false,
    overridePolicy: { policy: 'minimum', floor: 14 },
  },
]

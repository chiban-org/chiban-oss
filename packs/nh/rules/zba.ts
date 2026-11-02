import { RSA_674_33, RSA_676_7 } from '@packs/nh/rules/boardUrls'
import type { ClockRule, PackRule } from '@packs/nh/schema'

function noticeRule(key: string, label: string, citationLabel: string): ClockRule {
  return {
    kind: 'clock',
    key,
    version: 1,
    label,
    citation: { label: citationLabel, url: RSA_676_7 },
    clockType: 'notice_lead',
    whose: 'board',
    startEvent: 'acceptance_meeting_set',
    length: { unit: 'days', value: 5 },
    direction: 'before',
    consequence: {
      kind: 'notice_defective',
      text: `Notice later than this does not meet ${citationLabel}.`,
    },
    extension: { allowed: false, note: `${citationLabel} sets the minimum notice period.` },
    waivable: false,
    overridePolicy: { policy: 'minimum', floor: 5 },
  }
}

export const ZBA_RULES: PackRule[] = [
  {
    kind: 'clock',
    key: 'nh.zba.hearing',
    version: 1,
    label: 'ZBA hearing deadline',
    citation: { label: 'RSA 676:7 II', url: RSA_676_7 },
    clockType: 'action_due',
    whose: 'board',
    startEvent: 'application_received',
    length: { unit: 'days', value: 45 },
    direction: 'after',
    consequence: {
      kind: 'none_stated',
      text: 'RSA 676:7 II states no consequence for a late hearing. The application shows as overdue.',
    },
    extension: { allowed: false, note: 'RSA 676:7 provides no extension.' },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'clock',
    key: 'nh.zba.decision',
    version: 1,
    label: 'ZBA decision deadline',
    citation: { label: 'RSA 674:33 VIII', url: RSA_674_33 },
    clockType: 'action_due',
    whose: 'board',
    startEvent: 'application_received',
    length: { unit: 'days', value: 90 },
    direction: 'after',
    consequence: {
      kind: 'none_stated',
      text: 'RSA 674:33 VIII states no consequence for a late decision. The application shows as overdue.',
    },
    extension: { allowed: true, by: 'applicant_consent' },
    waivable: true,
    overridePolicy: { policy: 'fixed' },
  },
  noticeRule('nh.zba.notice.mail', 'ZBA mailed notice', 'RSA 676:7 I(a)'),
  noticeRule('nh.zba.notice.newspaper', 'ZBA published notice', 'RSA 676:7 I(b)'),
  {
    kind: 'clock',
    key: 'nh.zba.exercise',
    version: 1,
    label: 'Variance or special exception exercise deadline',
    citation: { label: 'RSA 674:33 I-a(a)', url: RSA_674_33 },
    clockType: 'exercise_by',
    whose: 'applicant',
    startEvent: 'final_approval',
    length: { unit: 'months', value: 24 },
    direction: 'after',
    consequence: {
      kind: 'lapse',
      text: 'The variance or special exception expires unless exercised within 2 years of final approval or as extended (RSA 674:33 I-a, IV(b)).',
    },
    extension: { allowed: true, by: 'board_good_cause' },
    waivable: false,
    overridePolicy: { policy: 'minimum', floor: 24 },
  },
]

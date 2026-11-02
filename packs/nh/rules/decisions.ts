import { RSA_36_57_URL, RSA_676_3 } from '@packs/nh/rules/boardUrls'
import type { PackRule } from '@packs/nh/schema'

export const DECISION_RULES: PackRule[] = [
  {
    kind: 'clock',
    key: 'nh.board.decision_filing',
    version: 1,
    label: 'Minutes and written decision filing deadline',
    citation: { label: 'RSA 676:3 II', url: RSA_676_3 },
    clockType: 'action_due',
    whose: 'board',
    startEvent: 'board_vote',
    length: { unit: 'business_days', value: 5 },
    direction: 'after',
    consequence: {
      kind: 'amendment_window_opens',
      text: 'If minutes and the written decision are filed later, a party may amend a rehearing motion or court petition within 30 days after actual filing (RSA 677:2, 677:4, 677:15 I).',
    },
    extension: { allowed: false, note: 'RSA 676:3 II provides no extension.' },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'clock',
    key: 'nh.ri.transmittal',
    version: 1,
    label: 'Regional impact minutes and plans transmittal',
    citation: { label: 'RSA 36:57 II', url: RSA_36_57_URL },
    clockType: 'action_due',
    whose: 'board',
    startEvent: 'board_vote',
    length: { unit: 'business_days', value: 5 },
    direction: 'after',
    onlyWhen: { fact: 'regionalImpact', is: true },
    consequence: {
      kind: 'none_stated',
      text: 'RSA 36:57 II states no consequence. The transmittal shows as overdue.',
    },
    extension: { allowed: false, note: 'RSA 36:57 II provides no extension.' },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'required_record',
    key: 'nh.board.written_decision',
    version: 1,
    label: 'Written board decision',
    citation: { label: 'RSA 676:3 I', url: RSA_676_3 },
    fields: ['findings', 'conditions', 'reasonsForDisapproval'],
    conditionalFields: [
      { field: 'conditions', outcomes: ['approved_with_conditions'] },
      { field: 'reasonsForDisapproval', outcomes: ['denied'] },
    ],
    overridePolicy: { policy: 'fixed' },
  },
]

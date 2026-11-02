import type { PackRule } from '@packs/nh/schema'

const RSA_91A_4 = 'https://gc.nh.gov/rsa/html/VI/91-A/91-A-4.htm'

export const RTK_RULES: PackRule[] = [
  {
    kind: 'clock',
    key: 'nh.rtk.response',
    version: 1,
    label: 'First response to a Right-to-Know request',
    citation: { label: 'RSA 91-A:4 IV(b)', url: RSA_91A_4 },
    clockType: 'action_due',
    whose: 'official',
    startEvent: 'rtk_request_received',
    length: { unit: 'business_days', value: 5 },
    direction: 'after',
    consequence: {
      kind: 'none_stated',
      text: 'RSA 91-A:4 IV(b) requires the record, a denial, or a written statement of the time reasonably needed within 5 business days. The request shows as overdue.',
    },
    extension: {
      allowed: false,
      note: 'A written statement of the time reasonably necessary is itself a lawful response.',
    },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'clock',
    key: 'nh.rtk.stated_time',
    version: 1,
    label: 'Time the town stated it needs for a Right-to-Know request',
    citation: { label: 'RSA 91-A:4 IV(b)', url: RSA_91A_4 },
    clockType: 'action_due',
    whose: 'official',
    startEvent: 'rtk_time_statement',
    length: { unit: 'stated_date' },
    direction: 'after',
    consequence: {
      kind: 'none_stated',
      text: 'The time the town stated has passed without a decision.',
    },
    extension: {
      allowed: false,
      note: 'A written statement of the time reasonably necessary is itself a lawful response.',
    },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'required_record',
    key: 'nh.rtk.denial_statement',
    version: 1,
    label: 'Statement of the exemption and its explanation for a denied request',
    citation: { label: 'RSA 91-A:4 IV(c)', url: RSA_91A_4 },
    fields: ['exemption', 'explanation'],
    overridePolicy: { policy: 'fixed' },
  },
]

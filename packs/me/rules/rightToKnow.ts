import { ME_URLS } from '@packs/me/rules/urls'
import type { PackRule } from '@/features/packs/schema'

const SECTION_408A_3 = { label: '1 MRSA §408-A(3)', url: ME_URLS.title1sec408A } as const

export const FOAA_RULES: PackRule[] = [
  {
    kind: 'clock',
    key: 'me.foaa.acknowledge',
    version: 1,
    label: 'Acknowledgement of a FOAA request',
    citation: SECTION_408A_3,
    clockType: 'action_due',
    whose: 'official',
    startEvent: 'rtk_request_received',
    length: { unit: 'business_days', value: 5 },
    direction: 'after',
    consequence: {
      kind: 'none_stated',
      text: '1 MRSA §408-A(3) requires the town to acknowledge receipt within 5 working days. The request shows as overdue.',
    },
    extension: {
      allowed: false,
      note: 'The acknowledgement may ask the requester to clarify which records are wanted.',
    },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'clock',
    key: 'me.foaa.estimate',
    version: 1,
    label: 'Time the town estimated for a FOAA request',
    citation: SECTION_408A_3,
    clockType: 'action_due',
    whose: 'official',
    startEvent: 'rtk_time_statement',
    length: { unit: 'stated_date' },
    direction: 'after',
    consequence: {
      kind: 'none_stated',
      text: 'The time frame the town estimated has passed without a full response.',
    },
    extension: {
      allowed: false,
      note: 'The estimate is a good faith, nonbinding estimate of the time needed to comply.',
    },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'required_record',
    key: 'me.foaa.denial_notice',
    version: 1,
    label: 'Written notice of a denial, citing its statutory authority',
    citation: { label: '1 MRSA §408-A(4)', url: ME_URLS.title1sec408A },
    fields: ['exemption', 'explanation'],
    overridePolicy: { policy: 'fixed' },
  },
]

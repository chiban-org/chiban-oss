import { tradeStarter } from '@packs/nh/starters/trade'

export const ELECTRICAL_STARTER = tradeStarter({
  id: 'nh.starter.electrical',
  prefix: 'EL',
  slug: 'el',
  label: 'Electrical',
  affidavit: {
    label: 'Homeowner affidavit for electrical work',
    help: 'Needed when the owner does the electrical work instead of a licensed electrician (RSA 319-C:15 II).',
  },
  conditionText: 'Licensed electrician of record confirmed',
  extraField: {
    key: 'service_amps',
    label: 'Service size (amps)',
    type: 'integer',
    required: false,
    validation: { min: 0 },
  },
})

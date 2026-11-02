import { tradeStarter } from '@packs/nh/starters/trade'

export const ELECTRICAL_STARTER = tradeStarter({
  id: 'nh.starter.electrical',
  prefix: 'EL',
  slug: 'el',
  label: 'Electrical',
  conditionText: 'Licensed electrician of record confirmed',
  extraField: {
    key: 'service_amps',
    label: 'Service size (amps)',
    type: 'integer',
    required: false,
    validation: { min: 0 },
  },
})

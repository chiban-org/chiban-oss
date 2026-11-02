import { tradeStarter } from '@packs/nh/starters/trade'

export const PLUMBING_STARTER = tradeStarter({
  id: 'nh.starter.plumbing',
  prefix: 'PL',
  slug: 'pl',
  label: 'Plumbing',
  conditionText: 'Licensed plumber of record confirmed',
  extraField: {
    key: 'fixture_count',
    label: 'Number of fixtures',
    type: 'integer',
    required: false,
    validation: { min: 0 },
  },
})

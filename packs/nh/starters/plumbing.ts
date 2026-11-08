import { tradeStarter } from '@packs/nh/starters/trade'

export const PLUMBING_STARTER = tradeStarter({
  id: 'nh.starter.plumbing',
  prefix: 'PL',
  slug: 'pl',
  label: 'Plumbing',
  affidavit: {
    label: 'Homeowner affidavit for plumbing work',
    help: 'Needed when the owner does the plumbing instead of a licensed plumber (RSA 153:36 VIII(c)).',
  },
  conditionText: 'Licensed plumber of record confirmed',
  extraField: {
    key: 'fixture_count',
    label: 'Number of fixtures',
    type: 'integer',
    required: false,
    validation: { min: 0 },
  },
})

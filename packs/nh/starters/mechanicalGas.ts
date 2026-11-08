import { tradeStarter } from '@packs/nh/starters/trade'

export const MECHANICAL_GAS_STARTER = tradeStarter({
  id: 'nh.starter.mechanical_gas',
  prefix: 'MG',
  slug: 'mg',
  label: 'Mechanical and gas',
  affidavit: {
    label: 'Homeowner affidavit for fuel gas work',
    help: 'Needed when the owner does the fuel gas work instead of a licensed installer (RSA 153:36 I).',
  },
  conditionText: 'Licensed installer of record confirmed',
  extraField: {
    key: 'fuel_type',
    label: 'Fuel type',
    type: 'select',
    required: false,
    options: [
      { value: 'propane', label: 'Propane' },
      { value: 'natural_gas', label: 'Natural gas' },
      { value: 'oil', label: 'Oil' },
    ],
  },
})

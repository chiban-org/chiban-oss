import { tradeStarter } from '@packs/nh/starters/trade'

export const MECHANICAL_GAS_STARTER = tradeStarter({
  id: 'nh.starter.mechanical_gas',
  prefix: 'MG',
  slug: 'mg',
  label: 'Mechanical and gas',
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

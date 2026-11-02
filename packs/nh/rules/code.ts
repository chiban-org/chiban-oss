import type { PackRule } from '@packs/nh/schema'

export const CODE_RULES: PackRule[] = [
  {
    kind: 'town_setting',
    key: 'nh.code.technical_requirements',
    version: 1,
    label: 'Local amendments to technical requirements of the state building code',
    citation: {
      label: 'RSA 155-A:3',
      url: 'https://gc.nh.gov/rsa/html/XII/155-A/155-A-3.htm',
    },
    unit: 'days',
    overridePolicy: { policy: 'locally_prohibited' },
  },
]

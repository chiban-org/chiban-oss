import type { PackRule } from '@packs/nh/schema'

export const APPEAL_RULES: PackRule[] = [
  {
    kind: 'effect',
    key: 'nh.appeal.suspension',
    version: 1,
    label: 'Suspended by appeal (RSA 676:6)',
    citation: {
      label: 'RSA 676:6',
      url: 'https://gc.nh.gov/rsa/html/LXIV/676/676-6.htm',
    },
    effect: 'suspend_on_appeal_of_issuance',
    overridePolicy: { policy: 'fixed' },
  },
]

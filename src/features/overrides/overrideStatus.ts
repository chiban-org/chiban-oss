import type { OverrideStatus } from '@/features/parcels/aliasOverrides'

export const OVERRIDE_STATUSES = [
  'applied',
  'no_match',
  'superseded',
  'expired',
] as const satisfies readonly OverrideStatus[]

export const OVERRIDE_STATUS_LABELS: ReadonlyMap<OverrideStatus, string> = new Map([
  ['applied', 'Applied'],
  ['no_match', 'No match'],
  ['superseded', 'Superseded'],
  ['expired', 'Expired'],
])

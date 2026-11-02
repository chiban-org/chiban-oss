import { clockProbes } from '@/features/packs/probes/clockProbes'
import { enforcementProbes } from '@/features/packs/probes/enforcementProbes'
import { otherProbes } from '@/features/packs/probes/otherProbes'
import type { FieldProbe } from '@/features/packs/probes/probe'
import { seriesProbes } from '@/features/packs/probes/seriesProbes'

export type { FieldProbe } from '@/features/packs/probes/probe'

export const FIELD_PROBES: Record<string, FieldProbe> = {
  ...clockProbes(),
  ...otherProbes(),
  ...seriesProbes(),
  ...enforcementProbes(),
}

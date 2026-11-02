import { clockProbes } from '@/features/packs/probes/clockProbes'
import { otherProbes } from '@/features/packs/probes/otherProbes'
import type { FieldProbe } from '@/features/packs/probes/probe'

export type { FieldProbe } from '@/features/packs/probes/probe'

export const FIELD_PROBES: Record<string, FieldProbe> = {
  ...clockProbes(),
  ...otherProbes(),
}

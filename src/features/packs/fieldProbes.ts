import { abutterProbes } from '@/features/packs/probes/abutterProbes'
import { boardProbes } from '@/features/packs/probes/boardProbes'
import { clockProbes } from '@/features/packs/probes/clockProbes'
import { decisionProbes } from '@/features/packs/probes/decisionProbes'
import { otherProbes } from '@/features/packs/probes/otherProbes'
import type { FieldProbe } from '@/features/packs/probes/probe'
import { seriesProbes } from '@/features/packs/probes/seriesProbes'

export type { FieldProbe } from '@/features/packs/probes/probe'

export const FIELD_PROBES: Record<string, FieldProbe> = {
  ...clockProbes(),
  ...boardProbes(),
  ...decisionProbes(),
  ...abutterProbes(),
  ...otherProbes(),
  ...seriesProbes(),
}

import { NH_PACK } from '@packs/nh'
import type { StatePack } from '@/features/packs/schema'

export interface TownBufferShape {
  defaultFt: number | null
  maxFt: number
  maxSetBy?: 'state_law' | 'chiban'
}

export function packWithTownBuffer(townBuffer: TownBufferShape): StatePack {
  return {
    ...NH_PACK,
    manifest: {
      ...NH_PACK.manifest,
      abutterParams: NH_PACK.manifest.abutterParams.map((p) => ({ ...p, townBuffer })),
    },
  }
}

import { NH_PACK } from '@packs/nh'
import type { StatePack } from '@/features/packs/schema'

export function packWithoutCapture(): StatePack {
  return {
    ...NH_PACK,
    manifest: {
      ...NH_PACK.manifest,
      abutterParams: NH_PACK.manifest.abutterParams.map((p) => ({ ...p, captureRadiusFt: null })),
    },
  }
}

import { NH_PACK } from '@packs/nh'
import type { StatePack } from '@/features/packs/schema'

export const ACKNOWLEDGING_PACK: StatePack = {
  ...NH_PACK,
  recordsRequests: { acknowledgement: true },
}

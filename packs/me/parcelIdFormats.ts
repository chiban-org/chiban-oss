import type { PackParcelIdFormat } from '@/features/packs/schema'

export const ME_PARCEL_ID_FORMATS: readonly PackParcelIdFormat[] = [
  {
    key: 'map_lot',
    label: 'Map and lot',
    kind: 'free_text',
    width: null,
    isDisplay: true,
    example: 'R04-012',
  },
]

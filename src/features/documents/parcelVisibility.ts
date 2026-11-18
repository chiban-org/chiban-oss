import type { ParcelFileVisibility } from '@/features/documents/parcelFileVisibility'
import { packRoles } from '@/features/packs/roles'

export type { ParcelFileVisibility } from '@/features/documents/parcelFileVisibility'

export function defaultParcelFileVisibility(seriesKey: string): ParcelFileVisibility {
  return packRoles().recordSeries.publicParcelFiles.includes(seriesKey) ? 'public' : 'private'
}

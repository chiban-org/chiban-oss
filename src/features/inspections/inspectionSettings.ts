import type { DbOrTx } from '@/db/client'
import { getPublished } from '@/features/config/store'
import type { InspectionSettingsBody } from '@/features/inspections/settingsSchema'
import { activePack } from '@/features/packs/registry'

export async function getInspectionSettings(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<InspectionSettingsBody> {
  const published = await getPublished(db, 'inspection_settings', 'default', signal)
  return published === null
    ? activePack().inspectionSettingsDefault
    : (published.body as InspectionSettingsBody)
}

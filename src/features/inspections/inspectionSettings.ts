import { NH_INSPECTION_SETTINGS_DEFAULT } from '@packs/nh/starters'
import type { DbOrTx } from '@/db/client'
import { getPublished } from '@/features/config/store'
import type { InspectionSettingsBody } from '@/features/inspections/settingsSchema'

export async function getInspectionSettings(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<InspectionSettingsBody> {
  const published = await getPublished(db, 'inspection_settings', 'default', signal)
  return published === null
    ? NH_INSPECTION_SETTINGS_DEFAULT
    : (published.body as InspectionSettingsBody)
}

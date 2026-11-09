import type { DbOrTx } from '@/db/client'
import { parcelIdFormats } from '@/db/schema'

export const ID_FORMATS_SETTINGS_PATH = '/staff/settings/parcel-id-formats'

export const NO_ID_FORMATS_SENTENCE =
  'No parcel ID formats are set up yet. Add them under Settings, then Parcel ID formats, before importing parcels, owner data or scanned files.'

export const UNKNOWN_FORMAT_COPY =
  'No parcel ID format matches that name. Check the formats under Settings, then Parcel ID formats.'

export function unknownFormatSentence(key: string): string {
  return `No parcel ID format named ${key} exists. Check the names under Settings, then Parcel ID formats (${ID_FORMATS_SETTINGS_PATH}), or add it there.`
}

export async function hasIdFormats(db: DbOrTx): Promise<boolean> {
  const [row] = await db.select({ key: parcelIdFormats.key }).from(parcelIdFormats).limit(1)
  return row !== undefined
}

import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { parcelIdFormats } from '@/db/schema'
import { idFormatHint } from '@/features/parcels/idFormats'

export async function displayFormatHint(db: DbOrTx): Promise<string> {
  const [format] = await db
    .select()
    .from(parcelIdFormats)
    .where(eq(parcelIdFormats.isDisplay, true))
  return format === undefined ? '' : idFormatHint(format)
}

import { eq, inArray } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { parcelIdFormats } from '@/db/schema'
import { activePack } from '@/features/packs/registry'
import { usage } from '@/features/parcels/idFormatAdmin'

const NH_DEFAULT_FORMAT_KEYS = ['cama15', 'gis12'] as const

export interface PackFormatSync {
  inserted: string[]
  removed: string[]
}

export async function syncPackParcelIdFormats(
  db: Db,
  signal: AbortSignal,
): Promise<PackFormatSync> {
  signal.throwIfAborted()
  const formats = activePack().parcelIdFormats
  const packKeys = new Set(formats.map((f) => f.key))
  return await db.transaction(async (tx) => {
    const existing = await tx.select({ key: parcelIdFormats.key }).from(parcelIdFormats)
    const existingKeys = new Set(existing.map((r) => r.key))

    const removable = NH_DEFAULT_FORMAT_KEYS.filter(
      (key) => existingKeys.has(key) && !packKeys.has(key),
    )
    const used = new Set<string>()
    for (const key of removable) {
      const counts = await usage(tx, key)
      if (counts.aliases + counts.other > 0) used.add(key)
    }
    const removed = removable.filter((key) => !used.has(key))
    if (removed.length > 0) {
      await tx.delete(parcelIdFormats).where(inArray(parcelIdFormats.key, removed))
    }

    const missing = formats.filter((f) => !existingKeys.has(f.key))
    if (missing.length > 0) {
      await tx.insert(parcelIdFormats).values(
        missing.map(({ example: _example, isDisplay: _isDisplay, ...format }) => ({
          ...format,
          isDisplay: false,
        })),
      )
    }

    const [displayed] = await tx
      .select({ key: parcelIdFormats.key })
      .from(parcelIdFormats)
      .where(eq(parcelIdFormats.isDisplay, true))
    if (displayed === undefined) {
      const packDisplay = formats.find((f) => f.isDisplay)
      if (packDisplay !== undefined) {
        await tx
          .update(parcelIdFormats)
          .set({ isDisplay: true })
          .where(eq(parcelIdFormats.key, packDisplay.key))
      }
    }

    return { inserted: missing.map((f) => f.key), removed }
  })
}

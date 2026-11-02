import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { townSettings } from '@/db/schema'
import { err, ok, type Result } from '@/types/result'

export interface TownSettings {
  name: string
  stateCode: 'NH'
  timeZone: string
  basemapRasterUrl: string | null
  basemapAttribution: string | null
}

export async function getTownSettings(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<Result<TownSettings, 'not_configured'>> {
  signal.throwIfAborted()
  const rows = await db.select().from(townSettings).where(eq(townSettings.id, 1)).limit(1)
  const row = rows[0]
  if (!row) return err('not_configured')
  return ok({
    name: row.name,
    stateCode: 'NH',
    timeZone: row.timeZone,
    basemapRasterUrl: row.basemapRasterUrl,
    basemapAttribution: row.basemapAttribution,
  })
}

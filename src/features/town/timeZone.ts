import type { DbOrTx } from '@/db/client'
import { getTownSettings } from '@/features/town/settings'

export const DEFAULT_TIME_ZONE = 'America/New_York'

export async function townTimeZone(db: DbOrTx, signal: AbortSignal): Promise<string> {
  const town = await getTownSettings(db, signal)
  return town.ok ? town.value.timeZone : DEFAULT_TIME_ZONE
}

import type { DbOrTx } from '@/db/client'
import { getTownSettings } from '@/features/town/settings'
import { type CivilDate, compareCivil, todayInTimeZone } from '@/types/civilDate'

const FALLBACK_TIME_ZONE = 'UTC'

export async function townToday(db: DbOrTx, now: Date, signal: AbortSignal): Promise<CivilDate> {
  const town = await getTownSettings(db, signal)
  return todayInTimeZone(town.ok ? town.value.timeZone : FALLBACK_TIME_ZONE, now)
}

export async function isAfterTownToday(
  db: DbOrTx,
  date: CivilDate,
  now: Date,
  signal: AbortSignal,
): Promise<boolean> {
  return compareCivil(date, await townToday(db, now, signal)) > 0
}
